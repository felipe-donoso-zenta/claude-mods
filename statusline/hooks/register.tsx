import type { EngineInterface, Register } from 'claude-code'

// The bar itself is bin/statusline.js, run by Claude Code as the `statusLine` command (the only place that draws colors).
// This module keeps that script in ~/.claude/statusline/ current, and tells the person when the mod needs a patch.
// Hourly: one small request, so a security notice reaches the person within the hour.
const CHECK_MS = 60 * 60 * 1000
const REPO = 'felipe-donoso-zenta/claude-mods'
const MARKETPLACE = 'claude-mods'

const homeOf = ($: EngineInterface) => $.plugin.root.split(/[\\/]\.claude[\\/]/)[0]
const folderOf = ($: EngineInterface) => `${homeOf($)}/.claude/statusline`

function cmp(a: string, b: string): number {
  const x = a.split('.').map(Number)
  const y = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0)
  return 0
}

/** Copies the bar's script next to the settings that name it, only when it differs, so a plugin update reaches the bar. */
async function syncScript($: EngineInterface) {
  try {
    const wanted = await $.fs.read(`${$.plugin.root}/bin/statusline.js`)
    const target = `${folderOf($)}/statusline.js`
    const have = await $.fs.read(target).catch(() => '')
    if (have !== wanted) await $.fs.write(target, wanted)
  } catch {
    // no write access there: the bar keeps the copy it has
  }
}

/** The notice the bar shows when the mod is behind: a short line, or nothing. */
async function writeNotice($: EngineInterface, text: string) {
  try {
    await $.fs.write(`${folderOf($)}/update.txt`, text)
  } catch {
    // no notice file: the toast still goes out
  }
}

// Compares this mod's version with versions.json in the repo; gh carries the person's own GitHub auth, so the private repo is readable.
async function checkUpdate($: EngineInterface): Promise<string> {
  const name = $.plugin.name
  try {
    const current: string = JSON.parse(await $.fs.read(`${$.plugin.root}/.claude-plugin/plugin.json`)).version ?? '0.0.0'
    // Every call starts from the mod's own folder: Windows looks in the working folder first, and a gh.cmd planted in a cloned repo must not run.
    const { stdout } = await $.process.run(
      ['gh', 'api', '-H', 'Accept: application/vnd.github.raw', `repos/${REPO}/contents/versions.json`],
      { cwd: $.plugin.root, timeoutMs: 10000 },
    )
    const raw = JSON.parse(stdout)[name]
    // versions.json is text from the network: only a plain version and a short line without control characters get through.
    const version = (v: unknown) => (typeof v === 'string' && /^\d+\.\d+\.\d+$/.test(v) ? v : undefined)
    const entry = { latest: version(raw?.latest), minSafe: version(raw?.minSafe) }
    const command = `claude plugin update ${name}@${MARKETPLACE}`
    if (entry.minSafe && cmp(current, entry.minSafe) < 0) {
      $.ui.toast(`⚠ ${name} v${current} tiene bugs o vulnerabilidades corregidas (minima segura v${entry.minSafe}). Actualiza ya: ${command}`, { timeoutMs: 20000 })
      return `⚠ ${name} v${current} desactualizado`
    }
    if (entry.latest && cmp(current, entry.latest) < 0) {
      $.ui.toast(`${name} v${current}: hay v${entry.latest}. Actualiza: ${command}`, { timeoutMs: 10000 })
      return `↑ ${name} v${entry.latest}`
    }
  } catch {
    // offline or no gh session: no notice
  }
  return ''
}

export const register: Register = on => {
  let isStarted = false

  on('session.start', async ($, e, next) => {
    const started = await next(e)

    if (!isStarted) {
      isStarted = true
      await syncScript($)
      const check = async () => writeNotice($, await checkUpdate($))
      void check()
      $.clock.every(CHECK_MS, () => { void check() })
    }

    return started
  })
}
