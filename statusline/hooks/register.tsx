import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

const FRAME_MS = 1000
const GIT_MS = 5000
const ACCOUNT_MS = 60000
const CHECK_MS = 6 * 60 * 60 * 1000
const FRAMES = ['✻', '✽', '✺', '✹', '✺', '✽']
const REPO = 'felipe-donoso-zenta/claude-mods'
const MARKETPLACE = 'claude-mods'
const GIT = ['git', '-c', 'core.fsmonitor=false']

const C = { spark: '#d7875f', model: '#ffaf5f', branch: '#5fafff', account: '#af87ff', ok: '#5faf5f', warn: '#d7af5f', bad: '#d75f5f' }

type Snapshot = { frame: number; model: string; branch: string; dirty: number; ahead: number; behind: number; account: string; percent: number | null; update: string }
const EMPTY: Snapshot = { frame: 0, model: '', branch: '', dirty: 0, ahead: 0, behind: 0, account: '', percent: null, update: '' }
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
      { timeoutMs: 10000 },
    )
    const entry = JSON.parse(stdout)[name]
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

async function readGit($: EngineInterface) {
  const run = (args: string[]) => $.process.run([...GIT, ...args], { timeoutMs: 800 }).then(r => r.stdout.trim()).catch(() => undefined)
  const branch = await run(['rev-parse', '--abbrev-ref', 'HEAD'])
  if (!branch) return { branch: '', dirty: 0, ahead: 0, behind: 0 }
  const dirty = ((await run(['status', '--porcelain'])) ?? '').split('\n').filter(Boolean).length
  const [behind = 0, ahead = 0] = ((await run(['rev-list', '--left-right', '--count', '@{u}...HEAD'])) ?? '').split(/\s+/).map(Number)
  return { branch, dirty, ahead, behind }
}

async function readAccount($: EngineInterface) {
  try {
    const { stdout, stderr } = await $.process.run(['gh', 'auth', 'status'], { timeoutMs: 5000 })
    const active = `${stdout}\n${stderr}`.split(/(?=✓ Logged in|X Failed)/).find(b => /Active account: true/.test(b))
    return active?.match(/account (\S+)/)?.[1] ?? ''
  } catch {
    return ''
  }
}

export const register: Register = on => {
  let isStarted = false

  on('session.start', async ($, e, next) => {
    const started = await next(e)

    if (!isStarted) {
      isStarted = true
      const patch = (p: Partial<Snapshot>) => update($, snapshot, s => ({ ...s, ...p }))
      const tick = async () => {
        const usage = await $.session.usage().catch(() => undefined)
        void patch({
          frame: Math.floor(Date.now() / 1000) % FRAMES.length,
          model: shortModel(await $.session.model().catch(() => '')),
          percent: usage?.context.percent ?? null,
        })
      }
      await tick()
      void readAccount($).then(account => patch({ account }))
      void readGit($).then(patch)
      void checkUpdate($).then(update => patch({ update }))
      $.clock.every(FRAME_MS, () => { void tick() })
      $.clock.every(GIT_MS, () => { void readGit($).then(patch) })
      $.clock.every(ACCOUNT_MS, () => { void readAccount($).then(account => patch({ account })) })
      $.clock.every(CHECK_MS, () => { void checkUpdate($).then(update => patch({ update })) })
    }

    return started
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const beneath = await next(e)
    if (e.props.hasSurvey) return beneath
    const s = await read($, snapshot)
    if (s.model === '') return beneath

    const { Box, Text } = $.ui.resolve(e)
    const sep = <Text dimColor>  │  </Text>
    const color = s.percent === null ? C.ok : s.percent >= 80 ? C.bad : s.percent >= 60 ? C.warn : C.ok
    const filled = s.percent === null ? 0 : Math.round(s.percent / 10)

    return (
      <Box flexDirection="column">
        {beneath}
        <Box>
          <Text color={C.spark}>{FRAMES[s.frame % FRAMES.length]} </Text>
          <Text bold color={C.model}>{s.model}</Text>
          {s.branch === '' ? null : (
            <Box>
              {sep}
              <Text color={C.branch}>⎇ {s.branch}</Text>
              {s.dirty > 0 ? <Text color={C.warn}> ●{s.dirty}</Text> : <Text color={C.ok}> ✓</Text>}
              {s.ahead > 0 ? <Text color={C.ok}> ↑{s.ahead}</Text> : null}
              {s.behind > 0 ? <Text color={C.bad}> ↓{s.behind}</Text> : null}
            </Box>
          )}
          {s.account === '' ? null : <Box>{sep}<Text color={C.account}>◉ {s.account}</Text></Box>}
          {s.percent === null ? null : (
            <Box>
              {sep}
              <Text color={color}>{'▰'.repeat(filled)}</Text>
              <Text dimColor>{'▱'.repeat(10 - filled)}</Text>
              <Text color={color}> {Math.round(s.percent)}%</Text>
            </Box>
          )}
          {s.update === '' ? null : <Box>{sep}<Text color={C.warn}>{s.update}</Text></Box>}
        </Box>
      </Box>
    )
  })
}
