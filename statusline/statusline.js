#!/usr/bin/env node
// Statusline: animated Claude glyph + git branch/status + active GitHub account.
// Also forwards the payload to Orca's relay so its usage tracking keeps working.
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

let raw = '';
try { raw = fs.readFileSync(0, 'utf8'); } catch {}
let data = {};
try { data = JSON.parse(raw); } catch {}

const orca = path.join(os.homedir(), '.orca', 'agent-hooks', 'claude-statusline.cmd');
if (fs.existsSync(orca)) {
  try { spawnSync('cmd.exe', ['/c', orca], { input: raw, timeout: 2000, windowsHide: true }); } catch {}
}

const c = (code, s) => `\x1b[${code}m${s}\x1b[0m`;
const dir = (data.workspace && data.workspace.current_dir) || data.cwd || process.cwd();
const git = (...a) => {
  try { return execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', timeout: 800, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim(); }
  catch { return null; }
};

// Claude glyph cycles through its "sparkle" frames; slower when idle would need state, so keep it steady.
const frames = ['✻', '✽', '✺', '✹', '✺', '✽'];
const spark = c('38;5;173', frames[Math.floor(Date.now() / 1000) % frames.length]);

const parts = [spark + ' ' + c('1;38;5;215', (data.model && data.model.display_name) || 'Claude')];

const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
if (branch) {
  const dirty = (git('status', '--porcelain') || '').split('\n').filter(Boolean).length;
  let sync = '';
  const ab = git('rev-list', '--left-right', '--count', '@{u}...HEAD');
  if (ab) {
    const [behind, ahead] = ab.split(/\s+/).map(Number);
    if (ahead) sync += c('32', ` ↑${ahead}`);
    if (behind) sync += c('31', ` ↓${behind}`);
  }
  const state = dirty ? c('33', ` ●${dirty}`) : c('32', ' ✓');
  parts.push(c('38;5;75', '⎇ ' + branch) + state + sync);
}

let account = '';
try {
  const m = fs.readFileSync(path.join(process.env.GH_CONFIG_DIR || (process.env.APPDATA ? path.join(process.env.APPDATA, 'GitHub CLI') : path.join(os.homedir(), '.config', 'gh')), 'hosts.yml'), 'utf8').match(/^\s{4}user:\s*(\S+)/m);
  if (m) account = m[1];
} catch {}
if (account) parts.push(c('38;5;141', '◉ ' + account));

const pct = data.context_window && data.context_window.used_percentage;
if (typeof pct === 'number') {
  const filled = Math.round(pct / 10);
  const col = pct >= 80 ? '31' : pct >= 60 ? '33' : '32';
  parts.push(c(col, '▰'.repeat(filled)) + c('90', '▱'.repeat(10 - filled)) + c(col, ` ${Math.round(pct)}%`));
}

process.stdout.write(parts.join(c('90', '  │  ')));
