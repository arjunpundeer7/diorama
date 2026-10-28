'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jsonc = require('jsonc-parser');
const core = require('../src/core');
const terminal = require('../src/cli/terminal');
const { ROOT, tempDir } = require('./helpers');

const theme = core.createCatalog({ roots: [ROOT] }).theme('lagoon');

const SETTINGS = `// Windows Terminal settings, with comments that must survive.
{
    "$schema": "https://aka.ms/terminal-profiles-schema",
    "defaultProfile": "{61c54bbd-c2c6-5271-96e7-009a87ff44bf}",
    "profiles": {
        // shared by every profile
        "defaults": {},
        "list": []
    }
}
`;

const shaderPath = (text) => jsonc.parse(text).profiles.defaults[terminal.WT_KEY];

test('Windows Terminal: install sets the shader and keeps comments; restore removes it', (t) => {
  const home = tempDir(t);
  const settingsPath = path.join(home, 'settings.json');
  fs.writeFileSync(settingsPath, SETTINGS);

  const r = terminal.installWindowsTerminal({ theme, settingsPath, home });
  const text = fs.readFileSync(settingsPath, 'utf8');
  assert.equal(shaderPath(text), r.shaderPath);
  assert.ok(fs.existsSync(r.shaderPath));
  assert.ok(fs.existsSync(r.backup));
  assert.ok(text.includes('// shared by every profile'));
  assert.equal(r.previous, null);

  assert.equal(terminal.restoreWindowsTerminal({ settingsPath, previous: r.previous, shaderPath: r.shaderPath }).changed, true);
  const after = fs.readFileSync(settingsPath, 'utf8');
  assert.equal(shaderPath(after), undefined);
  assert.ok(after.includes('// shared by every profile'));
});

test('Windows Terminal: restore puts back a shader the user had before', (t) => {
  const home = tempDir(t);
  const settingsPath = path.join(home, 'settings.json');
  fs.writeFileSync(settingsPath, SETTINGS.replace('"defaults": {}', `"defaults": { "${terminal.WT_KEY}": "C:\\\\mine.hlsl" }`));
  const r = terminal.installWindowsTerminal({ theme, settingsPath, home });
  assert.equal(r.previous, 'C:\\mine.hlsl');
  terminal.restoreWindowsTerminal({ settingsPath, previous: r.previous, shaderPath: r.shaderPath });
  assert.equal(shaderPath(fs.readFileSync(settingsPath, 'utf8')), 'C:\\mine.hlsl');
});

test('Windows Terminal: restore leaves a shader someone else set afterwards', (t) => {
  const home = tempDir(t);
  const settingsPath = path.join(home, 'settings.json');
  fs.writeFileSync(settingsPath, SETTINGS);
  const r = terminal.installWindowsTerminal({ theme, settingsPath, home });
  const changed = fs.readFileSync(settingsPath, 'utf8').replace(JSON.stringify(r.shaderPath), '"D:\\\\other.hlsl"');
  fs.writeFileSync(settingsPath, changed);
  assert.equal(terminal.restoreWindowsTerminal({ settingsPath, previous: null, shaderPath: r.shaderPath }).changed, false);
});

test('Windows Terminal: the old profiles list layout is refused with advice', (t) => {
  const home = tempDir(t);
  const settingsPath = path.join(home, 'settings.json');
  fs.writeFileSync(settingsPath, '{ "profiles": [] }');
  assert.throws(() => terminal.installWindowsTerminal({ theme, settingsPath, home }), /old "profiles"/);
});

test('Ghostty: install appends one block; restore gives back the original file', (t) => {
  const home = tempDir(t);
  const configPath = path.join(home, 'ghostty', 'config');
  fs.mkdirSync(path.dirname(configPath));
  const original = 'font-size = 14\ntheme = dark\n';
  fs.writeFileSync(configPath, original);

  terminal.installGhostty({ theme, configPath, home });
  terminal.installGhostty({ theme, configPath, home });
  const text = fs.readFileSync(configPath, 'utf8');
  assert.equal(text.split('# diorama:start').length, 2);
  assert.match(text, /custom-shader = .*lagoon\.glsl/);
  assert.match(text, /custom-shader-animation = always/);

  assert.equal(terminal.restoreGhostty({ configPath }).changed, true);
  assert.equal(fs.readFileSync(configPath, 'utf8'), original);
});
