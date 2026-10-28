'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../src/core');
const scaffold = require('../src/cli/scaffold');
const apps = require('../src/cli/apps');
const { ROOT, tempDir } = require('./helpers');

test('new theme copies a theme under a new id that the catalog accepts', (t) => {
  const home = tempDir(t);
  const from = core.createCatalog({ roots: [ROOT] }).theme('drift');
  const dir = scaffold.newTheme({ id: 'sunrise', from, dir: path.join(home, 'themes') });
  assert.ok(fs.existsSync(path.join(dir, 'scene.js')));
  assert.ok(!fs.existsSync(path.join(dir, 'preview.png')));
  const catalog = core.createCatalog({ roots: [home] });
  assert.deepEqual(catalog.errors, []);
  assert.equal(catalog.theme('sunrise').name, 'Sunrise');
  assert.throws(() => scaffold.newTheme({ id: 'sunrise', from, dir: path.join(home, 'themes') }), /already exists/);
  assert.throws(() => scaffold.newTheme({ id: 'Bad Name', from, dir: home }), /lowercase/);
});

test('new skin writes a skin the catalog accepts', (t) => {
  const home = tempDir(t);
  scaffold.newSkin({ id: 'notes', url: 'https://notes.example.com/*', home });
  const skin = core.createCatalog({ roots: [home] }).skin('notes');
  assert.deepEqual(skin.match.urls, ['https://notes.example.com/*']);
  assert.throws(() => scaffold.newSkin({ id: 'other', home }), /--url/);
});

test('new app registers an executable that launch can find', (t) => {
  const home = tempDir(t);
  const exe = path.join(home, 'App.exe');
  fs.writeFileSync(exe, '');
  scaffold.newApp({ id: 'my-app', exe, skin: 'notes', home });
  apps.useHome(home);
  t.after(() => apps.useHome(tempDir(t)));
  const app = apps.detect(apps.byId('my-app'));
  assert.equal(app.installed, true);
  assert.equal(app.exe, exe);
  assert.deepEqual(app.skins, ['notes']);
  assert.ok(apps.byId('vscode'), 'built-in apps are still there');
});
