'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const jsonc = require('jsonc-parser');
const { UserError } = require('./ui');

const WT_KEY = 'experimental.pixelShaderPath';
const GHOSTTY_START = '# diorama:start';
const GHOSTTY_END = '# diorama:end';
const GHOSTTY_RE = /# diorama:start[^\n]*\n[\s\S]*?# diorama:end\r?\n?/g;

function windowsTerminalSettings() {
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const candidates = [
    path.join(local, 'Packages', 'Microsoft.WindowsTerminal_8wekyb3d8bbwe', 'LocalState', 'settings.json'),
    path.join(local, 'Packages', 'Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe', 'LocalState', 'settings.json'),
    path.join(local, 'Microsoft', 'Windows Terminal', 'settings.json'),
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function ghosttyConfig() {
  const xdg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  const candidates = [path.join(xdg, 'ghostty', 'config')];
  if (process.platform === 'darwin') {
    candidates.push(path.join(os.homedir(), 'Library', 'Application Support', 'com.mitchellh.ghostty', 'config'));
  }
  return candidates.find((p) => fs.existsSync(p)) || candidates[0];
}

function copyShader(theme, key, ext, home) {
  const rel = theme.terminal && theme.terminal[key];
  if (!rel) throw new UserError(`Theme "${theme.id}" has no shader for this terminal yet.`);
  const dest = path.join(home, 'terminal', `${theme.id}.${ext}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(theme.dir, rel), dest);
  return dest;
}

function backup(file, home, name) {
  const dir = path.join(home, 'backups', name);
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `${path.basename(file)}.${new Date().toISOString().replace(/[:.]/g, '-')}`);
  fs.copyFileSync(file, dest);
  return dest;
}

function formatting(text) {
  const m = /\n([ \t]+)\S/.exec(text);
  const indent = m ? m[1] : '    ';
  return { insertSpaces: !indent.startsWith('\t'), tabSize: indent.startsWith('\t') ? 1 : indent.length, eol: text.includes('\r\n') ? '\r\n' : '\n' };
}

function parseSettings(text) {
  const errors = [];
  const tree = jsonc.parse(text, errors, { allowTrailingComma: true });
  if (errors.length || !tree || typeof tree !== 'object') {
    throw new UserError('Windows Terminal settings.json has syntax errors.', 'Fix the errors in Windows Terminal (Settings > Open JSON file) first.');
  }
  if (Array.isArray(tree.profiles)) {
    throw new UserError(
      'This settings.json uses the old "profiles": [ ... ] layout.',
      'Open Windows Terminal settings and save once so it upgrades the file, then try again.',
    );
  }
  return tree;
}

function setShaderPath(text, value) {
  const edits = jsonc.modify(text, ['profiles', 'defaults', WT_KEY], value, { formattingOptions: formatting(text) });
  return jsonc.applyEdits(text, edits);
}

function installWindowsTerminal({ theme, settingsPath, home }) {
  settingsPath = settingsPath || windowsTerminalSettings();
  if (!settingsPath) throw new UserError('Could not find Windows Terminal settings.json.', 'Pass it with --settings <file>.');
  const text = fs.readFileSync(settingsPath, 'utf8');
  const tree = parseSettings(text);
  const current = tree.profiles && tree.profiles.defaults && tree.profiles.defaults[WT_KEY];
  const shaderPath = copyShader(theme, 'windowsTerminal', 'hlsl', home);
  const saved = backup(settingsPath, home, 'windows-terminal');
  fs.writeFileSync(settingsPath, setShaderPath(text, shaderPath));
  return { settingsPath, shaderPath, backup: saved, previous: current === undefined ? null : current };
}

function restoreWindowsTerminal({ settingsPath, previous, shaderPath }) {
  settingsPath = settingsPath || windowsTerminalSettings();
  if (!settingsPath || !fs.existsSync(settingsPath)) return { changed: false };
  const text = fs.readFileSync(settingsPath, 'utf8');
  const tree = parseSettings(text);
  const current = tree.profiles && tree.profiles.defaults && tree.profiles.defaults[WT_KEY];
  if (current === undefined || (shaderPath && current !== shaderPath)) return { changed: false, settingsPath };
  fs.writeFileSync(settingsPath, setShaderPath(text, previous === null || previous === undefined ? undefined : previous));
  return { changed: true, settingsPath };
}

function installGhostty({ theme, configPath, home }) {
  configPath = configPath || ghosttyConfig();
  const shaderPath = copyShader(theme, 'ghostty', 'glsl', home);
  const text = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
  if (text) backup(configPath, home, 'ghostty');
  const value = /\s/.test(shaderPath) ? JSON.stringify(shaderPath) : shaderPath;
  const block =
    `${GHOSTTY_START} (added by \`diorama apply\`; remove with \`diorama restore ghostty\`)\n` +
    `custom-shader = ${value}\n` +
    'custom-shader-animation = always\n' +
    `${GHOSTTY_END}\n`;
  const clean = text.replace(GHOSTTY_RE, '');
  const next = clean + (clean && !clean.endsWith('\n') ? '\n' : '') + block;
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, next);
  return { configPath, shaderPath };
}

function restoreGhostty({ configPath }) {
  configPath = configPath || ghosttyConfig();
  if (!fs.existsSync(configPath)) return { changed: false, configPath };
  const text = fs.readFileSync(configPath, 'utf8');
  const clean = text.replace(GHOSTTY_RE, '');
  if (clean === text) return { changed: false, configPath };
  fs.writeFileSync(configPath, clean);
  return { changed: true, configPath };
}

module.exports = {
  windowsTerminalSettings,
  ghosttyConfig,
  installWindowsTerminal,
  restoreWindowsTerminal,
  installGhostty,
  restoreGhostty,
  WT_KEY,
};
