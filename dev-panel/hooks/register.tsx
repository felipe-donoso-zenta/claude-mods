import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderNode } from 'claude-code'

import type { Activity, Live, Port, Prefs, Repo, Section, Stats, Style, Todo } from '../types'

const PANE = 'dev-panel'

const REPO = 'felipe-donoso-zenta/claude-mods'
const MARKETPLACE = 'claude-mods'
const CHECK_MS = 6 * 60 * 60 * 1000

type Status = { name: string; current: string; latest?: string; minSafe?: string; notes?: string }

function cmp(a: string, b: string): number {
  const x = a.split('.').map(Number)
  const y = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0)
  return 0
}

// Compares this mod's version with versions.json in the repo; gh carries the person's own GitHub auth, so the private repo is readable.
async function checkUpdate($: EngineInterface): Promise<Status> {
  const name = $.plugin.name
  let current = '?'
  try {
    current = JSON.parse(await $.fs.read(`${$.plugin.root}/.claude-plugin/plugin.json`)).version ?? '?'
  } catch {
    return { name, current }
  }
  try {
    const { stdout } = await $.process.run(
      ['gh', 'api', '-H', 'Accept: application/vnd.github.raw', `repos/${REPO}/contents/versions.json`],
      { timeoutMs: 10000 },
    )
    const entry = JSON.parse(stdout)[name]
    return { name, current, latest: entry?.latest, minSafe: entry?.minSafe, notes: entry?.notes }
  } catch {
    return { name, current }
  }
}

function announce($: EngineInterface, s: Status): void {
  const update = `claude plugin update ${s.name}@${MARKETPLACE}`
  if (s.minSafe && cmp(s.current, s.minSafe) < 0) {
    $.ui.toast(`⚠ ${s.name} v${s.current} tiene bugs o vulnerabilidades corregidas (minima segura v${s.minSafe}). Actualiza ya: ${update}${s.notes ? ` · ${s.notes}` : ''}`, { timeoutMs: 20000 })
  } else if (s.latest && cmp(s.current, s.latest) < 0) {
    $.ui.toast(`${s.name} v${s.current}: hay v${s.latest}. Actualiza: ${update}`, { timeoutMs: 10000 })
  }
}

function versionLine(s: Status): string {
  if (s.minSafe && cmp(s.current, s.minSafe) < 0) return `⚠ ${s.name} v${s.current} desactualizado (v${s.minSafe}+)`
  if (s.latest && cmp(s.current, s.latest) < 0) return `↑ ${s.name} v${s.current} → v${s.latest}`
  return `${s.name} v${s.current}`
}

const REFRESH_MS = 10000
const MAX_FILES = 5
const MAX_PORTS = 8
const COMPACT_WIDTH = 24
const MAX_REPOS = 8
const GIT = ['git', '-c', 'core.fsmonitor=false']
const DEV_PROCESSES = /^(node|bun|deno|java|python|pythonw|dotnet|php|ruby|go|docker|com\.docker.*|wslrelay|vite|ng|firebase|caddy|nginx)$/i
// Absolute, so a powershell.exe dropped in a project folder is never the one that runs.
const POWERSHELL = 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'

const todos = atom({ plugin: 'dev-panel', key: 'todos' } as const, [] as Todo[], { shape: 'todos-1' })
const prompt = atom({ plugin: 'dev-panel', key: 'prompt' } as const, '', { shape: 'prompt-1' })
const stats = atom({ plugin: 'dev-panel', key: 'stats' } as const, null as Stats | null, { shape: 'stats-1' })
const repos = atom({ plugin: 'dev-panel', key: 'repos' } as const, [] as Repo[], { shape: 'repos-2' })
const ports = atom({ plugin: 'dev-panel', key: 'ports' } as const, [] as Port[], { shape: 'ports-1' })
const at = atom({ plugin: 'dev-panel', key: 'at' } as const, '', { shape: 'at-1' })
const DEFAULT_STYLE: Style = { theme: 'claude', isCompact: false, hidden: [] }
const style = atom({ plugin: 'dev-panel', key: 'style' } as const, DEFAULT_STYLE, { shape: 'style-1' })
const DEFAULT_PREFS: Prefs = { isNotifyOn: true, isSoundOn: true, isPermissionOn: true, isErrorOn: true, minSeconds: 20, budgetUsd: 0, isAlertOn: true }
const EMPTY_ACTIVITY: Activity = { turnCosts: [], tools: [], files: [], agents: 0 }
const activity = atom({ plugin: 'dev-panel', key: 'activity' } as const, EMPTY_ACTIVITY, { shape: 'activity-1' })
const prefs = atom({ plugin: 'dev-panel', key: 'prefs' } as const, DEFAULT_PREFS, { shape: 'prefs-1' })
const live = atom({ plugin: 'dev-panel', key: 'live' } as const, { model: '', effort: '' } as Live, { shape: 'live-1' })
const view = atom({ plugin: 'dev-panel', key: 'view' } as const, 'main', { shape: 'view-1' })
// Not a valid repo name (it holds a space), so it can share the list with them.
const OPTIONS_KEY = 'opciones panel'
// Names of the repos whose detail is folded away, plus the options block.
const folded = atom({ plugin: 'dev-panel', key: 'folded' } as const, [] as string[], { shape: 'folded-1' })

// accent: headings and the live item; ok / warn / bad: the bars and dots by how full or healthy.
type Palette = { accent: string; ok: string; warn: string; bad: string }
const THEMES: Record<string, Palette> = {
  claude: { accent: '#d97757', ok: '#4ade80', warn: '#fbbf24', bad: '#f87171' },
  ocean: { accent: '#38bdf8', ok: '#34d399', warn: '#fcd34d', bad: '#fb7185' },
  neon: { accent: '#e879f9', ok: '#a3e635', warn: '#facc15', bad: '#ff5c8a' },
  forest: { accent: '#86efac', ok: '#4ade80', warn: '#fde047', bad: '#f87171' },
  mono: { accent: '#e5e5e5', ok: '#e5e5e5', warn: '#e5e5e5', bad: '#e5e5e5' },
}
const THEME_NAMES = Object.keys(THEMES)
const SECTIONS: Array<{ id: Section; label: string }> = [
  { id: 'task', label: 'Tarea' },
  { id: 'cost', label: 'Costo' },
  { id: 'activity', label: 'Actividad' },
  { id: 'ports', label: 'Puertos' },
  { id: 'git', label: 'Git' },
]
// The turn lengths the "minimum" button steps through.
const MIN_STEPS = [0, 5, 10, 20, 30, 60, 120]
// The session budgets (US dollars) the "budget" button steps through; 0 is no limit.
const BUDGET_STEPS = [0, 1, 2, 5, 10, 20, 50]
// Where a warning fires, as a share of the budget, of the context window or of a rate-limit window.
const BUDGET_WARN = [50, 80, 100]
const LIMIT_WARN = [80, 95]
const CONTEXT_WARN = 80
const FILE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const SPARK = '▁▂▃▄▅▆▇█'

// [hertz, milliseconds] pairs: each event has its own tune, so you know which one it is without looking.
const TUNES = {
  done: [[660, 120], [880, 120], [1175, 200]],
  ask: [[520, 160], [520, 160]],
  problem: [[440, 220], [330, 320]],
} as const

/** The session's directory when it is a repo, plus every direct child that is one (links are never followed). */
async function findRepos ($: EngineInterface, cwd: string) {
  const out: string[] = []
  if (await $.fs.exists(`${cwd}/.git`)) out.push(cwd)
  for (const entry of (await $.fs.list(cwd)).slice(0, 200)) {
    if (entry.kind !== 'dir' || entry.name.startsWith('.') || entry.name === 'node_modules') continue
    const child = `${cwd}/${entry.name}`
    if (await $.fs.exists(`${child}/.git`)) out.push(child)
  }
  return out.slice(0, MAX_REPOS)
}

const WIN_PORTS =
  '$ErrorActionPreference="SilentlyContinue"; Get-NetTCPConnection -State Listen | ForEach-Object { "$($_.LocalPort) $((Get-Process -Id $_.OwningProcess).ProcessName)" }'

/** Text from a repo (commit subject, branch, file name), a prompt or a tool call is untrusted: no control characters, so no escape sequence reaches the terminal. */
const clean = (text: string) => text.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
const hasOwn = (table: object, name: unknown): name is string => typeof name === 'string' && Object.prototype.hasOwnProperty.call(table, name)

/** What the store gave back, held to the shape of a Style: it is a file on disk anyone can edit. */
function sanitizeStyle (saved: unknown): Style {
  const s = (saved ?? {}) as Partial<Style>
  return {
    theme: hasOwn(THEMES, s.theme) ? s.theme : DEFAULT_STYLE.theme,
    isCompact: s.isCompact === true,
    hidden: Array.isArray(s.hidden) ? s.hidden.filter((h): h is Section => SECTIONS.some(sec => sec.id === h)) : [],
  }
}

/** The same for Prefs. */
function sanitizePrefs (saved: unknown): Prefs {
  const p = (saved ?? {}) as Partial<Prefs>
  return {
    isNotifyOn: p.isNotifyOn !== false,
    isSoundOn: p.isSoundOn !== false,
    isPermissionOn: p.isPermissionOn !== false,
    isErrorOn: p.isErrorOn !== false,
    minSeconds: typeof p.minSeconds === 'number' && p.minSeconds >= 0 && p.minSeconds <= 3600 ? Math.round(p.minSeconds) : DEFAULT_PREFS.minSeconds,
    budgetUsd: typeof p.budgetUsd === 'number' && p.budgetUsd >= 0 && p.budgetUsd <= 10000 ? p.budgetUsd : 0,
    isAlertOn: p.isAlertOn !== false,
  }
}

/** A row of bars, one per value, as tall as it is next to the largest: the cost of the last turns at a glance. */
function spark (values: number[]) {
  const top = Math.max(...values, 0)
  return values.map(v => (top <= 0 ? SPARK[0] : SPARK[Math.min(SPARK.length - 1, Math.floor((v / top) * (SPARK.length - 1)))])).join('')
}

const money = (usd: number) => `$${usd.toFixed(usd < 1 ? 3 : 2)}`
const tokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : `${n}`)
const base = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path
const bar = (percent: number, cells = 10) => {
  const filled = Math.round((Math.min(Math.max(percent, 0), 100) / 100) * cells)
  return { filled: '━'.repeat(filled), empty: '─'.repeat(cells - filled) }
}
const seconds = (ms: number) => (ms >= 60000 ? `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s` : `${Math.round(ms / 1000)}s`)
const shortModel = (id: string) => clean(id).replace(/^claude-/, '').replace(/-\d{8}$/, '')

function elapsed (ms: number) {
  const minutes = Math.max(0, Math.floor(ms / 60000))
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

/**
 * What the call is about, and no more: the program of a command or the name of a file.
 * Never the whole command line, which can carry a token and would sit on screen, in a recording or a screenshot.
 */
function detail (input: unknown) {
  const i = (input ?? {}) as Record<string, unknown>
  if (typeof i.command === 'string') return clean(i.command).trim().split(/\s+/)[0]?.split(/[\\/]/).pop()?.slice(0, 30) ?? ''
  const file = [i.file_path, i.path].find(v => typeof v === 'string') as string | undefined
  return file ? clean(file).trim().split(/[\\/]/).pop()?.slice(0, 40) ?? '' : ''
}

async function readStats ($: EngineInterface, previousUsd: number) {
  const usage = await $.session.usage()
  const next: Stats = {
    usd: usage.cost?.usd ?? 0,
    turnUsd: 0,
    contextPercent: usage.context.percent ?? 0,
    contextTokens: usage.context.tokens ?? 0,
    window: usage.context.window,
    model: await $.session.model(),
    startedAt: usage.startedAt,
    turns: await $.session.turns(),
    limits: usage.rateLimits
      .filter(l => l.kind === 'five_hour' || l.kind === 'seven_day')
      .map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt })),
  }
  next.turnUsd = Math.max(0, next.usd - previousUsd)
  return next
}

let isRefreshing = false

async function refreshWorld ($: EngineInterface) {
  // One at a time: a slow git or port scan must not pile up under the 10 s timer.
  if (isRefreshing) return
  isRefreshing = true
  try {
    await scanWorld($)
  } finally {
    isRefreshing = false
  }
}

async function scanWorld ($: EngineInterface) {
  const cwd = await $.session.cwd()

  try {
    const roots = await findRepos($, cwd)
    const found: Repo[] = []
    for (const root of roots) {
      try {
        // A repo's own config can name a program for git to run (core.fsmonitor): off, since these may be repos nobody has read.
        const status = await $.process.run([...GIT, 'status', '--porcelain=v1', '-b'], { cwd: root, timeoutMs: 5000 })
        const [head, ...rest] = status.stdout.split('\n')
        const files = rest.filter(Boolean).map(line => clean(line.slice(3)))
        const log = await $.process.run([...GIT, 'log', '-1', '--format=%h %s'], { cwd: root, timeoutMs: 5000 }).catch(() => undefined)
        found.push({
          name: clean(base(root)),
          branch: clean(head.replace(/^## /, '').split('...')[0]),
          changes: files.length,
          ahead: Number(head.match(/ahead (\d+)/)?.[1] ?? 0),
          behind: Number(head.match(/behind (\d+)/)?.[1] ?? 0),
          files,
          last: clean(log?.stdout.trim() ?? ''),
        })
      } catch {
        // not a readable repo: skip it
      }
    }
    await update($, repos, () => found)
  } catch {
    await update($, repos, () => [])
  }

  try {
    const { stdout } = await $.process.run([POWERSHELL, '-NoProfile', '-Command', WIN_PORTS], { timeoutMs: 8000 })
    const seen = new Map<number, string>()
    for (const line of stdout.split(/\r?\n/)) {
      const [port, name] = line.trim().split(/\s+/)
      if (Number(port) >= 1024 && name && DEV_PROCESSES.test(name)) seen.set(Number(port), name)
    }
    const list = [...seen].map(([port, name]) => ({ port, name })).sort((a, b) => a.port - b.port)
    await update($, ports, () => list.slice(0, MAX_PORTS))
  } catch {
    await update($, ports, () => [])
  }

  try {
    const working = (await $.agent.list()).filter(a => a.status === 'running' || a.status === 'waiting' || a.status === 'pending').length
    await update($, activity, a => ({ ...a, agents: working }))
  } catch {
    // no agents to count
  }

  const previous = (await read($, stats))?.usd ?? 0
  const current = await readStats($, previous)
  await update($, stats, old => ({ ...current, turnUsd: old?.turnUsd ?? 0 }))
  await update($, at, () => new Date().toLocaleTimeString())
  await checkAlerts($, current)
}

// What has already warned, so each threshold speaks once; it starts over with the session, and a value that falls back below re-arms its own.
const fired = new Set<string>()

/** The highest step the value has reached that has not warned yet, marking it and every lower one as warned; undefined when none is new. */
function reached (prefix: string, value: number, steps: number[]) {
  const step = [...steps].reverse().find(s => value >= s)
  if (step === undefined || fired.has(`${prefix}-${step}`)) return undefined
  for (const s of steps) if (s <= step) fired.add(`${prefix}-${s}`)
  return step
}

/** Warns when the session crosses its budget, fills its context or nears a rate limit. */
async function checkAlerts ($: EngineInterface, s: Stats) {
  const p = await read($, prefs)
  if (!p.isNotifyOn || !p.isAlertOn) return
  const warn = (text: string) => {
    $.ui.toast(text, { timeoutMs: 8000 })
    void play($, 'ask')
  }

  if (p.budgetUsd > 0) {
    const step = reached('budget', (s.usd / p.budgetUsd) * 100, BUDGET_WARN)
    if (step !== undefined) warn(`$ ${step}% del presupuesto · ${money(s.usd)} de ${money(p.budgetUsd)}`)
  }

  if (s.contextPercent < CONTEXT_WARN - 20) fired.delete(`context-${CONTEXT_WARN}`)
  if (reached('context', s.contextPercent, [CONTEXT_WARN]) !== undefined) warn(`Contexto al ${Math.round(s.contextPercent)}% · conviene /compact`)

  for (const l of s.limits) {
    if (l.percentUsed < 50) for (const step of LIMIT_WARN) fired.delete(`${l.kind}-${step}`)
    const step = reached(l.kind, l.percentUsed, LIMIT_WARN)
    if (step !== undefined) warn(`Límite de ${l.kind === 'five_hour' ? '5 h' : 'la semana'} al ${Math.round(l.percentUsed)}%`)
  }
}

/** Compact asks the surface for a narrow, short pane (a square block); full asks for a wide one. */
async function openPane ($: EngineInterface, isCompact: boolean) {
  return $.ui.open({ id: PANE, title: 'Dev', columns: isCompact ? 30 : 60, rows: isCompact ? 18 : undefined })
}

/** Changes the style and keeps it for the next session. */
async function restyle ($: EngineInterface, change: (old: Style) => Style) {
  const old = await read($, style)
  const next = change(old)
  await update($, style, () => next)
  await $.store.set('style', next)
  if (next.isCompact !== old.isCompact) await openPane($, next.isCompact)
}

/** Changes what the notifications do and keeps it for the next session. */
async function setPrefs ($: EngineInterface, change: (old: Prefs) => Prefs) {
  const old = await read($, prefs)
  const next = sanitizePrefs(change(old))
  if (next.budgetUsd !== old.budgetUsd) for (const step of BUDGET_WARN) fired.delete(`budget-${step}`)
  await update($, prefs, () => next)
  await $.store.set('prefs', next)
}

// Windows has no audio player for $.audio.play, so the tune goes through PowerShell.
async function play ($: EngineInterface, tune: keyof typeof TUNES) {
  if (!(await read($, prefs)).isSoundOn) return
  const beeps = TUNES[tune].map(([hz, ms]) => `[console]::Beep(${hz},${ms})`).join(';')
  try {
    await $.process.run([POWERSHELL, '-NoProfile', '-Command', beeps], { timeoutMs: 4000 })
  } catch {
    // no sound is fine
  }
}

export const register: Register = on => {
  let isStarted = false
  let turnStartUsd = 0
  let status: Status | undefined

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'panel',
      description: 'Dev panel. /panel [settings | theme <name> | compact | hide <task|cost|ports|git> | show <section> | reset]',
    })
    await $.command.register({
      name: 'notify',
      description: 'Notifications. /notify [on | off | sound on|off | min <seconds> | test]',
    })
    const savedStyle = sanitizeStyle(await $.store.get('style'))
    const savedPrefs = sanitizePrefs(await $.store.get('prefs'))
    await update($, style, () => savedStyle)
    await update($, prefs, () => savedPrefs)
    await update($, live, () => ({ model: '', effort: '' }))
    await update($, view, () => 'main')
    await update($, activity, () => EMPTY_ACTIVITY)
    fired.clear()
    if (!isStarted) {
      isStarted = true
      await refreshWorld($)
      $.clock.every(REFRESH_MS, () => { void refreshWorld($) })
      const check = async () => {
        const before = status && versionLine(status)
        status = await checkUpdate($)
        if (versionLine(status) !== before) announce($, status)
      }
      void check()
      $.clock.every(CHECK_MS, () => { void check() })
    }
    void openPane($, (await read($, style)).isCompact)
    return next(e)
  })

  on('command.run', { command: 'panel' }, async ($, e) => {
    const [verb, arg] = e.args.trim().split(/\s+/)
    if (verb === 'version') return { text: versionLine(status ?? (await checkUpdate($))) }
    if (verb === 'settings' || verb === 'ajustes') await update($, view, () => 'settings')
    else if (verb === 'theme' && hasOwn(THEMES, arg)) await restyle($, s => ({ ...s, theme: arg }))
    else if (verb === 'theme') return { text: `Temas: ${THEME_NAMES.join(', ')}` }
    else if (verb === 'compact') await restyle($, s => ({ ...s, isCompact: !s.isCompact }))
    else if (verb === 'hide' && SECTIONS.some(s => s.id === arg)) {
      await restyle($, s => ({ ...s, hidden: [...new Set([...s.hidden, arg as Section])] }))
    } else if (verb === 'show' && SECTIONS.some(s => s.id === arg)) {
      await restyle($, s => ({ ...s, hidden: s.hidden.filter(h => h !== arg) }))
    } else if (verb === 'reset') await restyle($, () => DEFAULT_STYLE)

    await openPane($, (await read($, style)).isCompact)
    await refreshWorld($)
    return { text: 'Dev panel updated.' }
  })

  on('command.run', { command: 'notify' }, async ($, e) => {
    const [verb, arg] = e.args.trim().split(/\s+/)
    if (verb === 'on' || verb === 'off') await setPrefs($, p => ({ ...p, isNotifyOn: verb === 'on' }))
    else if (verb === 'sound' && (arg === 'on' || arg === 'off')) await setPrefs($, p => ({ ...p, isSoundOn: arg === 'on' }))
    else if (verb === 'min' && Number(arg) >= 0 && Number(arg) <= 3600) await setPrefs($, p => ({ ...p, minSeconds: Number(arg) }))
    else if (verb === 'test') {
      $.ui.toast('Prueba: listo')
      await play($, 'done')
      await play($, 'ask')
      await play($, 'problem')
    }
    const p = await read($, prefs)
    return { text: `Avisos ${p.isNotifyOn ? 'activados' : 'apagados'} · sonido ${p.isSoundOn ? 'sí' : 'no'} · turnos desde ${p.minSeconds}s` }
  })

  on('turn.start', async ($, e, next) => {
    if (!e.agentId) {
      turnStartUsd = (await $.session.usage()).cost?.usd ?? 0
      if (e.text.trim()) await update($, prompt, () => clean(e.text).trim().replace(/\s+/g, ' ').slice(0, 160))
    }
    return next(e)
  })

  // The model and effort the request really goes out with, after any downgrade: what the footer shows.
  on('turn.step', async function* ($, e, next) {
    if (!e.agentId) {
      await update($, live, () => ({ model: shortModel(e.model), effort: e.effort === undefined ? '' : clean(String(e.effort)) }))
    }
    return yield* next(e)
  })

  // What the session does: tool calls by name, and the files it changes.
  on('tool.call', async ($, e, next) => {
    if (!e.agentId) {
      const name = clean(e.tool).slice(0, 40)
      const file = (e.input as { file_path?: unknown } | undefined)?.file_path
      const changed = FILE_TOOLS.has(e.tool) && typeof file === 'string' ? clean(file).split(/[\\/]/).pop()?.slice(0, 60) : undefined
      await update($, activity, a => {
        const tools = a.tools.map(([n, c]) => [n, c] as [string, number])
        const found = tools.find(([n]) => n === name)
        if (found) found[1] += 1
        else tools.push([name, 1])
        const files = changed ? [changed, ...a.files.filter(f => f !== changed)].slice(0, 20) : a.files
        return { ...a, tools: tools.sort((x, y) => y[1] - x[1]).slice(0, 12), files }
      })
    }
    return next(e)
  })

  // The model's own checklist is the "current task".
  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const input = e.input as { todos?: Array<{ content: string; status: Todo['status'] }> }
    if (Array.isArray(input.todos)) {
      const list = input.todos.slice(0, 50).map(t => ({
        content: clean(String(t.content ?? '')).slice(0, 200),
        status: t.status === 'in_progress' || t.status === 'completed' ? t.status : ('pending' as const),
      }))
      await update($, todos, () => list)
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId) return result

    const current = await readStats($, turnStartUsd)
    await update($, stats, () => current)
    await update($, activity, a => ({ ...a, turnCosts: [...a.turnCosts, current.turnUsd].slice(-12) }))
    await checkAlerts($, current)

    const p = await read($, prefs)
    if (!p.isNotifyOn) return result
    if (e.reason === 'error' || e.reason === 'refusal') {
      if (p.isErrorOn) {
        $.ui.toast(e.reason === 'error' ? '✗ El turno terminó con error' : '✗ El modelo rechazó la petición', { timeoutMs: 8000 })
        void play($, 'problem')
      }
    } else if (e.reason === 'answer' && e.durationMs >= p.minSeconds * 1000) {
      const cost = current.turnUsd > 0 ? ` · ${money(current.turnUsd)}` : ''
      $.ui.toast(`✓ Listo · ${seconds(e.durationMs)}${cost}`)
      void play($, 'done')
    }
    return result
  })

  // Only watches the verdict: it never changes what the engine decided.
  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    const p = await read($, prefs)
    if (p.isNotifyOn && p.isPermissionOn && e.tool_use_id && verdict.decision === 'ask') {
      const what = detail(e.input)
      $.ui.toast(`? Necesita permiso: ${clean(e.tool)}${what ? ` · ${what}` : ''}`, { timeoutMs: 8000 })
      void play($, 'ask')
    }
    return verdict
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const list = await read($, todos)
    const ask = await read($, prompt)
    const s = await read($, stats)
    const gits = await read($, repos)
    const open = await read($, ports)
    const when = await read($, at)
    const look = await read($, style)
    const p = await read($, prefs)
    const now_ = await read($, live)
    const screen = await read($, view)
    const act = await read($, activity)
    const fold = await read($, folded)
    const now = await $.clock.now()
    const isOptionsFolded = fold.includes(OPTIONS_KEY)
    const toggleFold = (name: string) => update($, folded, f => (f.includes(name) ? f.filter(n => n !== name) : [...f, name]))

    const pal = THEMES[look.theme] ?? THEMES.claude!
    // Green while there is room, amber as it fills, red when it is about to run out.
    const colorFor = (percent: number) => (percent >= 90 ? pal.bad : percent >= 75 ? pal.warn : pal.ok)
    const isShown = (id: Section) => !look.hidden.includes(id)
    // A blank line between sections; the compact column is too short for it.
    const gap = look.isCompact ? null : <Text> </Text>
    const doing = list.find(t => t.status === 'in_progress')
    const done = list.filter(t => t.status === 'completed').length
    const room = look.isCompact ? 1 : MAX_FILES
    // Compact is a narrow column, about as wide as it is tall: short bars, clipped lines, one-glyph buttons.
    const cells = look.isCompact ? 6 : 12
    const ruleWidth = look.isCompact ? COMPACT_WIDTH : 38
    const clip = (text: string) => (look.isCompact && text.length > COMPACT_WIDTH ? `${text.slice(0, COMPACT_WIDTH - 1)}…` : text)
    const themeName = look.theme.padEnd(6)
    const control = (isOn: boolean) => (isOn ? '●' : '○')
    const model = now_.model || (s ? shortModel(s.model) : '—')
    const effort = now_.effort || 'auto'
    const toggleSection = (id: Section) => restyle($, o => ({ ...o, hidden: o.hidden.includes(id) ? o.hidden.filter(h => h !== id) : [...o.hidden, id] }))
    const nextTheme = () => restyle($, o => ({ ...o, theme: THEME_NAMES[(THEME_NAMES.indexOf(o.theme) + 1) % THEME_NAMES.length] ?? o.theme }))
    const nextBudget = () => setPrefs($, o => ({ ...o, budgetUsd: BUDGET_STEPS[(BUDGET_STEPS.indexOf(o.budgetUsd) + 1) % BUDGET_STEPS.length] ?? 0 }))
    const budgetPercent = s && p.budgetUsd > 0 ? (s.usd / p.budgetUsd) * 100 : 0
    const nextMin = () => setPrefs($, o => ({ ...o, minSeconds: MIN_STEPS[(MIN_STEPS.indexOf(o.minSeconds) + 1) % MIN_STEPS.length] ?? 20 }))

    const frame = (body: RenderNode) => body

    /** `▌ TITLE ───── detail`: one look for every section, so the eye finds where each begins. */
    const heading = (icon: string, title: string, detail = '') => {
      const used = icon.length + title.length + detail.length + 4
      return (
        <Box flexDirection="row">
          <Text bold color={pal.accent}>{icon} {title.toUpperCase()} </Text>
          <Text dimColor>{'─'.repeat(Math.max(2, ruleWidth - used))}</Text>
          {detail === '' ? null : <Text dimColor> {detail}</Text>}
        </Box>
      )
    }

    /** `label ████░░░░ 42%  tail`: labels share one width, so the bars line up. */
    const meter = (label: string, percent: number, tail = '') => {
      const filled = Math.round((Math.min(Math.max(percent, 0), 100) / 100) * cells)
      return (
        <Text>
          <Text dimColor>{label.padEnd(look.isCompact ? 4 : 10)}</Text>
          <Text color={colorFor(percent)}>{'█'.repeat(filled)}</Text>
          <Text dimColor>{'░'.repeat(cells - filled)}</Text>
          <Text bold color={colorFor(percent)}> {String(Math.round(percent)).padStart(3)}%</Text>
          {tail === '' || look.isCompact ? null : <Text dimColor>  {tail}</Text>}
        </Text>
      )
    }

    // Always the first line of the pane: what answers, and how hard it thinks.
    const header = (
      <Box flexDirection="column">
        <Text>
          <Text bold color={pal.accent}>◆ {clip(model)}</Text>
          <Text dimColor>  esfuerzo </Text>
          <Text color={effort === 'max' || effort === 'xhigh' ? pal.warn : pal.accent}>{effort}</Text>
        </Text>
        {gap}
      </Box>
    )

    if (screen === 'settings') {
      const row = (label: string, button: RenderNode) => (
        <Box flexDirection="row">
          <Text dimColor>  {label.padEnd(look.isCompact ? 9 : 14)}</Text>
          {button}
        </Box>
      )
      return frame(
        <Box flexDirection="column">
          {header}
          {heading('⚙', 'Ajustes')}
          {gap}
          <Text bold>Avisos</Text>
          {row('Avisos', <Button key="notify" plain hotkey="a" label={`${control(p.isNotifyOn)} ${p.isNotifyOn ? 'activados' : 'apagados'}  [a]`} onPress={() => setPrefs($, o => ({ ...o, isNotifyOn: !o.isNotifyOn }))} />)}
          {row('Sonido', <Button key="sound" plain hotkey="s" label={`${control(p.isSoundOn)} ${p.isSoundOn ? 'sí' : 'no'}  [s]`} onPress={() => setPrefs($, o => ({ ...o, isSoundOn: !o.isSoundOn }))} />)}
          {row('Permisos', <Button key="permission" plain hotkey="p" label={`${control(p.isPermissionOn)} ${p.isPermissionOn ? 'avisar' : 'no'}  [p]`} onPress={() => setPrefs($, o => ({ ...o, isPermissionOn: !o.isPermissionOn }))} />)}
          {row('Errores', <Button key="error" plain hotkey="e" label={`${control(p.isErrorOn)} ${p.isErrorOn ? 'avisar' : 'no'}  [e]`} onPress={() => setPrefs($, o => ({ ...o, isErrorOn: !o.isErrorOn }))} />)}
          {row(look.isCompact ? 'Desde' : 'Turno desde', <Button key="min" plain hotkey="m" label={`${String(p.minSeconds).padStart(3)} s  [m]`} onPress={nextMin} />)}
          {row('Alertas', <Button key="alert" plain hotkey="l" label={`${control(p.isAlertOn)} ${p.isAlertOn ? 'activas' : 'apagadas'}  [l]`} onPress={() => setPrefs($, o => ({ ...o, isAlertOn: !o.isAlertOn }))} />)}
          {row('Presupuesto', <Button key="budget" plain hotkey="u" label={`${p.budgetUsd > 0 ? `$${String(p.budgetUsd).padEnd(6)}` : 'sin tope '}  [u]`} onPress={nextBudget} />)}
          {row('', (
            <Button
              key="test"
              plain
              hotkey="x"
              label="♪ probar avisos  [x]"
              onPress={() => {
                $.ui.toast('Prueba: listo')
                void play($, 'done').then(() => play($, 'ask')).then(() => play($, 'problem'))
              }}
            />
          ))}
          {gap}
          <Text bold>Aspecto</Text>
          {row('Tema', <Button key="theme" plain hotkey="t" label={`${themeName}  [t]`} onPress={nextTheme} />)}
          {row('Vista', <Button key="compact" plain hotkey="c" label={`${look.isCompact ? 'compacta' : 'completa '}  [c]`} onPress={() => restyle($, o => ({ ...o, isCompact: !o.isCompact }))} />)}
          {SECTIONS.map((sec, i) =>
            row(look.isCompact ? sec.label : `Sección ${sec.label}`, (
              <Button key={`section-${sec.id}`} plain hotkey={String(i + 1)} label={`${isShown(sec.id) ? '● visible' : '○ oculta '}  [${i + 1}]`} onPress={() => toggleSection(sec.id)} />
            )),
          )}
          {gap}
          <Button key="back" plain hotkey="b" label="← volver  [b]" onPress={() => update($, view, () => 'main')} />
        </Box>,
      )
    }

    return frame(
      <Box flexDirection="column">
        {header}
        {isShown('task') ? (
          <Box flexDirection="column">
            {heading('▶', 'Tarea', list.length > 0 ? `${done}/${list.length}` : '')}
            {list.length === 0 ? <Text dimColor>{ask ? clip(ask) : 'Nada en curso. Cuando Claude arme un plan, aparece aquí.'}</Text> : null}
            {list.length > 0 && look.isCompact ? <Text bold color={pal.accent}>▶ {clip((doing ?? list.find(t => t.status === 'pending') ?? list[0])?.content ?? '')}</Text> : null}
            {list.length > 0 && !look.isCompact
              ? list.slice(0, 6).map(t =>
                  t.status === 'in_progress' ? <Text bold color={pal.accent}>▶ {t.content}</Text>
                  : t.status === 'completed' ? <Text dimColor>✓ {t.content}</Text>
                  : <Text>○ {t.content}</Text>)
              : null}
            {list.length > 6 && !look.isCompact ? <Text dimColor>  +{list.length - 6} más</Text> : null}
            {gap}
          </Box>
        ) : null}

        {isShown('cost') && s ? (
          <Box flexDirection="column">
            {heading('$', 'Costo', look.isCompact ? '' : elapsed(now - s.startedAt))}
            <Text>
              <Text bold>{money(s.usd)}</Text>
              <Text dimColor> sesión</Text>
              {s.turnUsd > 0 && !look.isCompact ? <Text dimColor>  ·  +{money(s.turnUsd)} último turno</Text> : null}
              {look.isCompact ? null : <Text dimColor>  ·  {s.turns} prompts</Text>}
            </Text>
            {look.isCompact && s.turnUsd > 0 ? <Text dimColor>+{money(s.turnUsd)} turno</Text> : null}
            {p.budgetUsd > 0 ? meter(look.isCompact ? 'pres' : 'Presup.', budgetPercent, `de ${money(p.budgetUsd)}`) : null}
            {meter(look.isCompact ? 'ctx' : 'Contexto', s.contextPercent, `${tokens(s.contextTokens)}/${tokens(s.window)}`)}
            {s.limits.map(l => meter(l.kind === 'five_hour' ? '5 h' : look.isCompact ? 'sem' : 'Semana', l.percentUsed))}
            {gap}
          </Box>
        ) : null}

        {isShown('activity') ? (
          <Box flexDirection="column">
            {heading('≋', 'Actividad')}
            {act.turnCosts.length > 0 ? (
              <Text>
                <Text color={pal.accent}>{spark(act.turnCosts)}</Text>
                <Text dimColor>  costo por turno</Text>
              </Text>
            ) : <Text dimColor>sin turnos aún</Text>}
            <Text dimColor>
              {act.tools.reduce((sum, [, n]) => sum + n, 0)} herramientas
              {act.agents > 0 ? ` · ${act.agents} agente${act.agents === 1 ? '' : 's'}` : ''}
              {act.tools.length > 0 ? ` · ${act.tools.slice(0, look.isCompact ? 2 : 5).map(([name, n]) => `${clip(name)}×${n}`).join(' ')}` : ''}
            </Text>
            {act.files.length > 0 ? (
              <Text dimColor wrap="truncate-end">
                ✎ {act.files.length} editados: {act.files.slice(0, look.isCompact ? 1 : 4).join(', ')}
              </Text>
            ) : null}
            {gap}
          </Box>
        ) : null}

        {isShown('ports') ? (
          <Box flexDirection="column">
            {heading('⇄', 'Puertos', open.length > 0 ? `${open.length}` : '')}
            {open.length === 0 ? <Text dimColor>ninguno escuchando</Text> : null}
            {open.length > 0 ? (
              <Text>
                {open.map(o => (
                  <Text>
                    <Text color={pal.ok}>●</Text>
                    {look.isCompact ? o.port : <Text> :{o.port} <Text dimColor>{o.name}</Text></Text>}
                    {'   '}
                  </Text>
                ))}
              </Text>
            ) : null}
            {gap}
          </Box>
        ) : null}

        {isShown('git') ? (
          <Box flexDirection="column">
            {heading('⎇', 'Git', gits.length > 0 ? `${gits.length}` : '')}
            {gits.length === 0 ? <Text dimColor>sin repos aquí</Text> : null}
            {gits.map(r => {
              const isFolded = fold.includes(r.name)
              return (
                <Box flexDirection="column">
                  <Box flexDirection="row">
                    <Button key={`fold-${r.name}`} plain label={`${isFolded ? '▸' : '▾'} ${look.isCompact ? clip(r.name) : r.name}`} onPress={() => toggleFold(r.name)} />
                    <Text>
                      {'  '}
                      <Text color={pal.accent}>{look.isCompact ? clip(r.branch) : r.branch}</Text>
                      {r.changes > 0 ? <Text color={pal.warn}>  ~{r.changes}</Text> : <Text color={pal.ok}>  ✓</Text>}
                      {r.ahead > 0 ? <Text color={pal.ok}> ↑{r.ahead}</Text> : null}
                      {r.behind > 0 ? <Text color={pal.bad}> ↓{r.behind}</Text> : null}
                    </Text>
                  </Box>
                  {isFolded || look.isCompact ? null : r.last ? <Text dimColor wrap="truncate-end">  └ {r.last}</Text> : null}
                  {isFolded || look.isCompact ? null : r.files.slice(0, room).map(f => <Text dimColor wrap="truncate-start">    · {f}</Text>)}
                  {isFolded || look.isCompact || r.files.length <= room ? null : <Text dimColor>    · +{r.files.length - room} más</Text>}
                </Box>
              )
            })}
            {gap}
          </Box>
        ) : null}

        {/* Fixed-width labels, so a press never shifts its neighbours. */}
        {heading('☰', 'Opciones', look.isCompact || !when ? '' : `actualizado ${when}`)}
        <Box flexDirection="row">
          <Button key="options" plain label={isOptionsFolded ? '▸ mostrar' : '▾ ocultar'} onPress={() => toggleFold(OPTIONS_KEY)} />
        </Box>
        {isOptionsFolded ? null : (
          <Box flexDirection="column">
            <Box flexDirection="row" flexWrap="wrap">
              <Button key="refresh" plain hotkey="r" label={look.isCompact ? '↻' : '↻ actualizar [r]'} onPress={() => refreshWorld($)} />
              <Text>{look.isCompact ? ' ' : '   '}</Text>
              <Button key="theme" plain hotkey="t" label={look.isCompact ? '◐' : `◐ tema ${themeName}[t]`} onPress={nextTheme} />
              <Text>{look.isCompact ? ' ' : '   '}</Text>
              <Button key="compact" plain hotkey="c" label={look.isCompact ? '▢' : '▢ compacto [c]'} onPress={() => restyle($, o => ({ ...o, isCompact: !o.isCompact }))} />
              <Text>{look.isCompact ? ' ' : '   '}</Text>
              <Button key="settings" plain hotkey="s" label={look.isCompact ? '⚙' : '⚙ ajustes [s]'} onPress={() => update($, view, () => 'settings')} />
            </Box>
            <Box flexDirection="row" flexWrap="wrap">
              {SECTIONS.flatMap((sec, i) => [
                i > 0 ? <Text key={`gap-${sec.id}`}>{look.isCompact ? ' ' : '   '}</Text> : null,
                <Button
                  key={`section-${sec.id}`}
                  plain
                  hotkey={String(i + 1)}
                  label={look.isCompact ? control(isShown(sec.id)) : `${control(isShown(sec.id))} ${sec.label} [${i + 1}]`}
                  onPress={() => toggleSection(sec.id)}
                />,
              ])}
            </Box>
          </Box>
        )}
      </Box>,
    )
  })
}
