'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../src/core');
const { ROOT, tempDir } = require('./helpers');

test('every theme and skin in the repo is valid', () => {
  const catalog = core.createCatalog({ roots: [ROOT] });
  assert.deepEqual(catalog.errors, []);
  assert.ok(catalog.theme('lagoon'));
  for (const id of ['drift', 'dunes', 'koi', 'orbit']) assert.ok(catalog.theme(id), `theme ${id}`);
  for (const id of ['vscode', 'cursor', 'windsurf', 'codex-desktop', 'claude-web', 'chatgpt-web']) {
    assert.ok(catalog.skin(id), `skin ${id}`);
  }
});

test('a skin that extends another inherits its slots, vars and match', () => {
  const catalog = core.createCatalog({ roots: [ROOT] });
  const vscode = catalog.skin('vscode');
  const cursor = catalog.skin('cursor');
  assert.equal(cursor.id, 'cursor');
  assert.deepEqual(cursor.slots.slice(0, vscode.slots.length), vscode.slots);
  assert.deepEqual(cursor.vars.values, vscode.vars.values);
  assert.deepEqual(cursor.match, vscode.match);
});

test('webSkins only returns skins for http(s) pages', () => {
  const ids = core.createCatalog({ roots: [ROOT] }).webSkins().map((k) => k.id).sort();
  assert.deepEqual(ids, ['chatgpt-web', 'claude-web']);
});

test('validateTheme reports what is wrong', () => {
  const errors = core.validateTheme({ id: 'Bad Id', name: '', version: 1, scene: 3, fps: 500, palette: { dusk: {} } });
  assert.ok(errors.some((e) => e.startsWith('id ')));
  assert.ok(errors.some((e) => e.startsWith('name ')));
  assert.ok(errors.some((e) => e.startsWith('fps ')));
  assert.ok(errors.some((e) => e.includes('palette.dusk')));
});

test('validateSkin rejects unknown roles and missing selectors', () => {
  const errors = core.validateSkin({
    id: 'x',
    name: 'X',
    match: { urls: ['https://x.test/*'], exclude: 'nope' },
    slots: [{ name: 'a', role: 'sparkle', selectors: [] }],
    vars: { values: { color: 'red' } },
  });
  assert.ok(errors.some((e) => e.includes('role must be one of')));
  assert.ok(errors.some((e) => e.includes('selectors must be a non-empty list')));
  assert.ok(errors.some((e) => e.includes('match.exclude')));
  assert.ok(errors.some((e) => e.includes('not a custom property')));
});

test('a user root overrides a repo theme with the same id', (t) => {
  const home = tempDir(t);
  const dir = path.join(home, 'themes', 'drift');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'scene.js'), 'diorama.scene({});');
  fs.writeFileSync(
    path.join(dir, 'theme.json'),
    JSON.stringify({ id: 'drift', name: 'Mine', version: '1.0.0', scene: 'scene.js', palette: { dark: { base: '#000' } } }),
  );
  const catalog = core.createCatalog({ roots: [home, ROOT] });
  assert.equal(catalog.theme('drift').name, 'Mine');
});

test('a skin extending an unknown skin is reported, not thrown', (t) => {
  const home = tempDir(t);
  fs.mkdirSync(path.join(home, 'skins'));
  fs.writeFileSync(path.join(home, 'skins', 'orphan.json'), JSON.stringify({ id: 'orphan', name: 'Orphan', extends: 'nowhere' }));
  const catalog = core.createCatalog({ roots: [home] });
  assert.equal(catalog.skin('orphan'), null);
  assert.match(catalog.errors[0].problems[0], /unknown skin "nowhere"/);
});
