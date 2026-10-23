#!/usr/bin/env node
// Statusline: animated Claude glyph, model and effort, git branch/status, active GitHub account and context bar.
// Claude Code runs this as the `statusLine` command and pipes the session as JSON to stdin; whatever it prints is the bar.
// The statusline mod keeps this file in ~/.claude/statusline/ up to date and writes update.txt beside it.
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

let raw = '';
try { raw = fs.readFileSync(0, 'utf8'); } catch {}
let data = {};
try { data = JSON.parse(raw); } catch {}

const home = os.homedir();

// Forwards the payload to Orca's relay, when Orca is installed, so its usage tracking keeps working.
const orca = path.join(home, '.orca', 'agent-hooks', 'claude-statusline.cmd');
if (fs.existsSync(orca)) {
  try { spawnSync('cmd.exe', ['/c', orca], { input: raw, timeout: 2000, windowsHide: true, cwd: home }); } catch {}
}

const c = (code, s) => `\x1b[${code}m${s}\x1b[0m`;
// Text from a repo or a file is untrusted: no control characters reach the terminal.
const clean = s => String(s).replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ');
const dir = (data.workspace && data.workspace.current_dir) || data.cwd || process.cwd();

// Windows looks in the folder a program starts from before PATH: run git from the home folder, never from the project,
// so a git.exe planted in a cloned repo does not run. No optional locks, no fsmonitor, no signature check: a repo's own config
// must not run programs or get in the way of the person's own git.
const git = (...a) => {
  try {
    return execFileSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'log.showSignature=false', '-C', dir, ...a], {
      cwd: home, encoding: 'utf8', timeout: 800, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true,
    }).trim();
  } catch { return null; }
};

const frames = ['✻', '✽', '✺', '✹', '✺', '✽'];
const spark = c('38;5;173', frames[Math.floor(Date.now() / 1000) % frames.length]);

const model = clean((data.model && data.model.display_name) || 'Claude');
const effort = data.effort && typeof data.effort.level === 'string' ? clean(data.effort.level).slice(0, 12) : '';
const parts = [spark + ' ' + c('1;38;5;215', model) + (effort ? c('90', ' · ' + effort) : '')];

// One call gives branch, changes and how far ahead or behind it is.
const status = git('status', '--porcelain=v1', '-b');
if (status && status.startsWith('## ')) {
  const [head, ...rest] = status.split('\n');
  const branch = clean(head.slice(3).split('...')[0].replace(/^No commits yet on /, ''));
  const dirty = rest.filter(Boolean).length;
  const ahead = Number((head.match(/ahead (\d+)/) || [])[1] || 0);
  const behind = Number((head.match(/behind (\d+)/) || [])[1] || 0);
  let sync = '';
  if (ahead) sync += c('32', ` ↑${ahead}`);
  if (behind) sync += c('31', ` ↓${behind}`);
  parts.push(c('38;5;75', '⎇ ' + branch) + (dirty ? c('33', ` ●${dirty}`) : c('32', ' ✓')) + sync);
}

// The active account is in gh's hosts file: reading it costs nothing.
let account = '';
try {
  const hosts = path.join(process.env.GH_CONFIG_DIR || (process.env.APPDATA ? path.join(process.env.APPDATA, 'GitHub CLI') : path.join(home, '.config', 'gh')), 'hosts.yml');
  const m = fs.readFileSync(hosts, 'utf8').match(/^\s{4}user:\s*(\S+)/m);
  if (m) account = m[1].replace(/[^\w-]/g, '');
} catch {}
if (account) parts.push(c('38;5;141', '◉ ' + account));

const pct = data.context_window && data.context_window.used_percentage;
if (typeof pct === 'number') {
  const filled = Math.max(0, Math.min(10, Math.round(pct / 10)));
  const col = pct >= 80 ? '31' : pct >= 60 ? '33' : '32';
  parts.push(c(col, '▰'.repeat(filled)) + c('90', '▱'.repeat(10 - filled)) + c(col, ` ${Math.round(pct)}%`));
}

// The mod writes here when it is out of date (an update or a security patch is waiting).
try {
  const notice = clean(fs.readFileSync(path.join(home, '.claude', 'statusline', 'update.txt'), 'utf8')).trim().slice(0, 80);
  if (notice) parts.push(c('33', notice));
} catch {}

process.stdout.write(parts.join(c('90', '  │  ')));
