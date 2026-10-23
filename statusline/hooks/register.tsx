import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

const FRAME_MS = 1000
const GIT_MS = 5000
const ACCOUNT_MS = 15000
// Hourly: one small request, so a security notice reaches the person within the hour.
const CHECK_MS = 60 * 60 * 1000
const FRAMES = ['✻', '✽', '✺', '✹', '✺', '✽']
const REPO = 'felipe-donoso-zenta/claude-mods'
const MARKETPLACE = 'claude-mods'
// Windows looks in the folder a program starts from before it looks in PATH: a git.exe or gh.cmd planted in a cloned repo would run.
// Every call starts from the mod's own folder instead, and git is pointed at the repo with -C.
const GIT = ['git', '--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'log.showSignature=false']

type Snapshot = { frame: number; model: string; branch: string; dirty: number; ahead: number; behind: number; account: string; percent: number | null; update: string; effort: string }
const EMPTY: Snapshot = { frame: 0, model: '', effort: '', branch: '', dirty: 0, ahead: 0, behind: 0, account: '', percent: null, update: '' }
const snapshot = atom({ plugin: 'statusline', key: 'snapshot' } as const, EMPTY)

const shortModel = (id: string) => id.replace(/^claude-/, '').replace(/-\d{8}$/, '')

function cmp(a: string, b: string): number {
  const x = a.split('.').map(Number)
  const y = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0)
  return 0
}

// Compares this mod's version with versions.json in the repo; gh carries the person's own GitHub auth, so the private repo is readable.
async function checkUpdate($: EngineInterface): Promise<string> {
  const name = $.plugin.name
  try {
    const current: string = JSON.parse(await $.fs.read(`${$.plugin.root}/.claude-plugin/plugin.json`)).version ?? '0.0.0'
    const { stdout } = await $.process.run(
      ['gh', 'api', '-H', 'Accept: application/vnd.github.raw', `repos/${REPO}/contents/versions.json`],
      { cwd: $.plugin.root, timeoutMs: 10000 },
    )
    const raw = JSON.parse(stdout)[name]
    // versions.json is text from the network: only a plain version and a short line without control characters get through.
    const version = (v: unknown) => (typeof v === 'string' && /^\d+\.\d+\.\d+$/.test(v) ? v : undefined)
    const entry = { latest: version(raw?.latest), minSafe: version(raw?.minSafe), notes: typeof raw?.notes === 'string' ? raw.notes.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').slice(0, 120) : undefined }
    const command = `claude plugin update ${name}@${MARKETPLACE}`
    if (entry?.minSafe && cmp(current, entry.minSafe) < 0) {
      $.ui.toast(`⚠ ${name} v${current} tiene bugs o vulnerabilidades corregidas (minima segura v${entry.minSafe}). Actualiza ya: ${command}`, { timeoutMs: 20000 })
      return `⚠ v${current} desactualizado`
    }
    if (entry?.latest && cmp(current, entry.latest) < 0) {
      $.ui.toast(`${name} v${current}: hay v${entry.latest}. Actualiza: ${command}`, { timeoutMs: 10000 })
      return `↑ v${entry.latest}`
    }
  } catch {
    // offline or no gh session: no notice
  }
  return ''
}

// One call, and no optional locks: the status line must never get in the way of the person's own git.
async function readGit($: EngineInterface) {
  const none = { branch: '', dirty: 0, ahead: 0, behind: 0 }
  try {
    const dir = await $.session.cwd()
    const { stdout } = await $.process.run([...GIT, '-C', dir, 'status', '--porcelain=v1', '-b'], { cwd: $.plugin.root, timeoutMs: 2000 })
    const [head = '', ...rest] = stdout.split('\n')
    if (!head.startsWith('## ')) return none
    return {
      branch: head.slice(3).split('...')[0]!.replace(/^No commits yet on /, '').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' '),
      dirty: rest.filter(Boolean).length,
      ahead: Number(head.match(/ahead (\d+)/)?.[1] ?? 0),
      behind: Number(head.match(/behind (\d+)/)?.[1] ?? 0),
    }
  } catch {
    return none
  }
}

// The active account is in gh's hosts file: reading it costs nothing, where `gh auth status` calls GitHub each time.
let lastGh = 0
async function readAccount($: EngineInterface) {
  const home = $.plugin.root.split(/[\\/]\.claude[\\/]/)[0]
  for (const file of [`${home}/AppData/Roaming/GitHub CLI/hosts.yml`, `${home}/.config/gh/hosts.yml`]) {
    try {
      const login = (await $.fs.read(file)).match(/^\s{4}user:\s*(\S+)/m)?.[1]
      if (login) return login.replace(/[^\w-]/g, '')
    } catch {
      // not there: try the next
    }
  }
  if (Date.now() - lastGh < 5 * 60 * 1000) return ''
  lastGh = Date.now()
  try {
    const { stdout, stderr } = await $.process.run(['gh', 'auth', 'status'], { cwd: $.plugin.root, timeoutMs: 5000 })
    const active = `${stdout}
${stderr}`.split(/(?=✓ Logged in|X Failed)/).find(b => /Active account: true/.test(b))
    return active?.match(/account (\S+)/)?.[1] ?? ''
  } catch {
    return ''
  }
}

// The effort the person set, for the stretch before a turn tells the real one: the /config row first, then the per-model setting in settings.json.
async function readEffort($: EngineInterface, model: string) {
  const level = (v: unknown) => (typeof v === 'string' && /^[a-z]{2,8}$/.test(v) ? v : '')
  try {
    const row = (await $.config.list()).find(r => /effort/i.test(r.key))
    if (row && level(row.value)) return level(row.value)
  } catch {
    // no such row: read the file
  }
  try {
    const home = $.plugin.root.split(/[\\/]\.claude[\\/]/)[0]
    const settings = JSON.parse(await $.fs.read(`${home}/.claude/settings.json`))
    return level(settings.modelSettings?.[model]?.effortLevel) || level(settings.effortLevel)
  } catch {
    return ''
  }
}

const ESC = String.fromCharCode(27)
const paint = (code: string, text: string) => `${ESC}[${code}m${text}${ESC}[0m`

/** The bar as one line of colored text: what `$.ui.status` pins on its own row under the prompt. */
function barText(s: Snapshot): string {
  if (s.model === '') return ''
  const parts = [paint('38;5;173', FRAMES[s.frame % FRAMES.length]!) + ' ' + paint('1;38;5;215', s.model) + (s.effort === '' ? '' : paint('90', ` · ${s.effort}`))]
  if (s.branch !== '') {
    let sync = ''
    if (s.ahead > 0) sync += paint('32', ` ↑${s.ahead}`)
    if (s.behind > 0) sync += paint('31', ` ↓${s.behind}`)
    parts.push(paint('38;5;75', `⎇ ${s.branch}`) + (s.dirty > 0 ? paint('33', ` ●${s.dirty}`) : paint('32', ' ✓')) + sync)
  }
  if (s.account !== '') parts.push(paint('38;5;141', `◉ ${s.account}`))
  if (s.percent !== null) {
    const filled = Math.round(s.percent / 10)
    const code = s.percent >= 80 ? '31' : s.percent >= 60 ? '33' : '32'
    parts.push(paint(code, '▰'.repeat(filled)) + paint('90', '▱'.repeat(10 - filled)) + paint(code, ` ${Math.round(s.percent)}%`))
  }
  if (s.update !== '') parts.push(paint('33', s.update))
  return parts.join(paint('90', '  │  '))
}

export const register: Register = on => {
  let isStarted = false
  let liveModel = ''
  let liveEffort = ''
  let configEffort = ''
  let sessionModel = ''

  on('session.start', async ($, e, next) => {
    const started = await next(e)

    if (!isStarted) {
      isStarted = true
      const patch = (p: Partial<Snapshot>) => update($, snapshot, s => ({ ...s, ...p }))
      const tick = async () => {
        const usage = await $.session.usage().catch(() => undefined)
        const current = await $.session.model().catch(() => '')
        // /model switched it: what the last turn used no longer holds.
        if (current !== sessionModel) {
          sessionModel = current
          liveModel = ''
          liveEffort = ''
          configEffort = await readEffort($, current)
        }
        await patch({
          frame: Math.floor(Date.now() / 1000) % FRAMES.length,
          model: liveModel || shortModel(current),
          effort: liveEffort || configEffort,
          percent: usage?.context.percent ?? null,
        })
        $.ui.status(barText(await read($, snapshot)))
      }
      await tick()
      void readAccount($).then(account => patch({ account }))
      void readGit($).then(patch)
      void checkUpdate($).then(update => patch({ update }))
      $.clock.every(FRAME_MS, () => { void tick() })
      $.clock.every(GIT_MS, () => {
        void readGit($).then(patch)
        // /effort changes it without a model switch.
        void readEffort($, sessionModel).then(effort => {
          if (effort === configEffort) return
          configEffort = effort
          liveEffort = ''
        })
      })
      $.clock.every(ACCOUNT_MS, () => { void readAccount($).then(account => patch({ account })) })
      $.clock.every(CHECK_MS, () => { void checkUpdate($).then(update => patch({ update })) })
    }

    return started
  })

  // The model and effort the request really goes out with, after any downgrade.
  on('turn.step', async function* ($, e, next) {
    if (!e.agentId) {
      liveModel = shortModel(e.model)
      liveEffort = e.effort === undefined ? '' : String(e.effort).replace(/[^\w-]/g, '')
    }
    return yield* next(e)
  })
}
