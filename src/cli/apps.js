'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const HOME = os.homedir();
const LOCAL = process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local');
const PF = process.env.ProgramFiles || 'C:\\Program Files';
const PF86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

const editor = (id, name, skins, installs, exe) => ({ id, name, kind: 'workbench', skins, installs, exe });

const APPS = [
  editor(
    'vscode',
    'VS Code',
    ['vscode'],
    {
      win32: [path.join(LOCAL, 'Programs', 'Microsoft VS Code'), path.join(PF, 'Microsoft VS Code')],
      darwin: ['/Applications/Visual Studio Code.app'],
      linux: ['/usr/share/code', '/opt/visual-studio-code'],
    },
    { win32: ['Code.exe'], darwin: ['Contents/MacOS/Code', 'Contents/MacOS/Electron'], linux: ['code'] },
  ),
  editor(
    'vscode-insiders',
    'VS Code Insiders',
    ['vscode'],
    {
      win32: [path.join(LOCAL, 'Programs', 'Microsoft VS Code Insiders'), path.join(PF, 'Microsoft VS Code Insiders')],
      darwin: ['/Applications/Visual Studio Code - Insiders.app'],
      linux: ['/usr/share/code-insiders'],
    },
    { win32: ['Code - Insiders.exe'], darwin: ['Contents/MacOS/Code - Insiders', 'Contents/MacOS/Electron'], linux: ['code-insiders'] },
  ),
  editor(
    'cursor',
    'Cursor',
    ['cursor'],
    {
      win32: [path.join(LOCAL, 'Programs', 'cursor'), path.join(PF, 'cursor')],
      darwin: ['/Applications/Cursor.app'],
      linux: ['/opt/Cursor', '/usr/share/cursor'],
    },
    { win32: ['Cursor.exe'], darwin: ['Contents/MacOS/Cursor'], linux: ['cursor'] },
  ),
  editor(
    'windsurf',
    'Windsurf',
    ['windsurf'],
    {
      win32: [path.join(LOCAL, 'Programs', 'Windsurf'), path.join(PF, 'Windsurf')],
      darwin: ['/Applications/Windsurf.app'],
      linux: ['/usr/share/windsurf', '/opt/Windsurf'],
    },
    { win32: ['Windsurf.exe'], darwin: ['Contents/MacOS/Windsurf', 'Contents/MacOS/Electron'], linux: ['windsurf'] },
  ),
  editor(
    'vscodium',
    'VSCodium',
    ['vscode'],
    {
      win32: [path.join(LOCAL, 'Programs', 'VSCodium'), path.join(PF, 'VSCodium')],
      darwin: ['/Applications/VSCodium.app'],
      linux: ['/usr/share/codium', '/opt/vscodium'],
    },
    { win32: ['VSCodium.exe'], darwin: ['Contents/MacOS/VSCodium', 'Contents/MacOS/Electron'], linux: ['codium'] },
  ),
  {
    id: 'codex',
    name: 'Codex',
    kind: 'electron',
    skins: ['codex-desktop'],
    msix: { name: 'OpenAI.Codex', exe: 'app/ChatGPT.exe' },
    installs: { darwin: ['/Applications/Codex.app'] },
    exe: { darwin: ['Contents/MacOS/Codex'] },
  },
  {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    kind: 'blocked',
    reason:
      'Claude Desktop quits when started with a DevTools port, so it cannot be themed without modifying the signed app, ' +
      'and diorama does not do that. claude.ai has the same interface: use the browser extension there.',
    msix: { name: 'Claude', exe: 'app/claude.exe' },
    installs: { win32: [path.join(LOCAL, 'AnthropicClaude')], darwin: ['/Applications/Claude.app'] },
    exe: { win32: ['claude.exe'], darwin: ['Contents/MacOS/Claude'] },
  },
  {
    id: 'chrome',
    name: 'Google Chrome',
    kind: 'browser',
    installs: {
      win32: [path.join(PF, 'Google', 'Chrome', 'Application'), path.join(LOCAL, 'Google', 'Chrome', 'Application')],
      darwin: ['/Applications/Google Chrome.app'],
      linux: ['/usr/bin'],
    },
    exe: { win32: ['chrome.exe'], darwin: ['Contents/MacOS/Google Chrome'], linux: ['google-chrome', 'google-chrome-stable'] },
  },
  {
    id: 'edge',
    name: 'Microsoft Edge',
    kind: 'browser',
    installs: {
      win32: [path.join(PF86, 'Microsoft', 'Edge', 'Application'), path.join(PF, 'Microsoft', 'Edge', 'Application')],
      darwin: ['/Applications/Microsoft Edge.app'],
      linux: ['/usr/bin'],
    },
    exe: { win32: ['msedge.exe'], darwin: ['Contents/MacOS/Microsoft Edge'], linux: ['microsoft-edge', 'microsoft-edge-stable'] },
  },
  { id: 'windows-terminal', name: 'Windows Terminal', kind: 'terminal', platforms: ['win32'] },
  { id: 'ghostty', name: 'Ghostty', kind: 'terminal', platforms: ['darwin', 'linux'] },
];

const msixCache = new Map();
function msixLocation(name) {
  if (process.platform !== 'win32') return null;
  if (msixCache.has(name)) return msixCache.get(name);
  let location = null;
  try {
    location =
      execFileSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', '(Get-AppxPackage -Name $env:DIORAMA_PKG | Select-Object -First 1).InstallLocation'],
        { env: { ...process.env, DIORAMA_PKG: name }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 },
      ).trim() || null;
  } catch {
    location = null;
  }
  msixCache.set(name, location);
  return location;
}

function findAppRoot(dir) {
  const candidates = [path.join(dir, 'resources', 'app'), path.join(dir, 'Contents', 'Resources', 'app')];
  if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) candidates.push(path.join(dir, entry.name, 'resources', 'app'));
    }
  }
  const found = candidates
    .filter((p) => fs.existsSync(path.join(p, 'product.json')))
    .map((p) => ({ p, t: fs.statSync(path.join(p, 'product.json')).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  return found.length ? found[0].p : null;
}

function readVersion(appRoot) {
  try {
    return JSON.parse(fs.readFileSync(path.join(appRoot, 'product.json'), 'utf8')).version || null;
  } catch {
    return null;
  }
}

function detect(app) {
  const platform = process.platform;
  const result = { ...app, installed: false, dir: null, exe: null, appRoot: null, version: null };
  if (app.kind === 'terminal') {
    result.installed = (app.platforms || []).includes(platform);
    return result;
  }
  if (app.msix) {
    const loc = msixLocation(app.msix.name);
    if (loc) {
      const exe = path.join(loc, ...app.msix.exe.split('/'));
      if (fs.existsSync(exe)) {
        const m = /_(\d+(?:\.\d+)+)_/.exec(path.basename(loc));
        return { ...result, installed: true, dir: loc, exe, version: m ? m[1] : null, packaged: true };
      }
    }
  }
  for (const dir of (app.installs && app.installs[platform]) || []) {
    for (const rel of (app.exe && app.exe[platform]) || []) {
      const exe = path.join(dir, rel);
      if (!fs.existsSync(exe)) continue;
      result.installed = true;
      result.dir = dir;
      result.exe = exe;
      if (app.kind === 'workbench') {
        result.appRoot = findAppRoot(dir);
        result.version = result.appRoot && readVersion(result.appRoot);
      }
      return result;
    }
  }
  return result;
}

function userApps(home) {
  try {
    const list = JSON.parse(fs.readFileSync(path.join(home, 'apps.json'), 'utf8'));
    return list.map((a) => ({ kind: 'electron', skins: [], ...a, custom: true }));
  } catch {
    return [];
  }
}

let extra = [];
const useHome = (home) => (extra = userApps(home));
const all = () => [...extra, ...APPS.filter((a) => !extra.some((x) => x.id === a.id))];
const byId = (id) => all().find((a) => a.id === id) || null;

function detectCustom(app) {
  const exe = app.exe && fs.existsSync(app.exe) ? app.exe : null;
  return { ...app, installed: !!exe, exe, dir: exe && path.dirname(exe), appRoot: null, version: null };
}

const resolve = (app) => (app.custom ? detectCustom(app) : detect(app));

module.exports = { APPS, all, byId, detect: resolve, useHome, userApps, findAppRoot, readVersion };
