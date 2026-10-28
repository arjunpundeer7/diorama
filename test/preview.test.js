'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/core');
const preview = require('../src/cli/preview');
const fs = require('node:fs');
const path = require('node:path');
const build = require('../src/cli/build');
const { ROOT, tempDir } = require('./helpers');

test('the preview server serves themes, configs and nothing outside its folders', async (t) => {
  const server = await preview.startServer({ catalog: core.createCatalog({ roots: [ROOT] }), set: { speed: 2 } });
  t.after(() => server.close());
  const get = (p) => fetch(server.url + p);

  const themes = await (await get('/api/themes.json')).json();
  assert.deepEqual(themes.map((x) => x.id).sort(), ['drift', 'dunes', 'koi', 'lagoon', 'orbit']);

  const config = await (await get('/api/config/koi.json')).json();
  assert.equal(config.theme.id, 'koi');
  assert.equal(config.theme.options.speed, 2);
  assert.equal(config.renderer.url, 'renderer.html?theme=koi');
  assert.equal(config.options.frame, true);

  for (const p of ['/', '/index.html', '/gallery.html', '/runtime.js', '/engine.js', '/renderer.html', '/themes/lagoon/scene.js', '/preview/demo.js']) {
    assert.equal((await get(p)).status, 200, p);
  }
  for (const p of ['/themes/lagoon/..%2F..%2Fpackage.json', '/preview/..%2Fsrc%2Fcli%2Fmain.js', '/themes/nope/scene.js', '/package.json', '/api/config/nope.json']) {
    assert.equal((await get(p)).status, 404, p);
  }
});

test('the static site has every file the demo asks for', (t) => {
  const out = tempDir(t);
  build.buildSite({ out, catalog: core.createCatalog({ roots: [ROOT] }) });
  for (const rel of ['index.html', 'gallery.html', 'runtime.js', 'engine.js', 'renderer.html', 'renderer.js', 'preview/demo.js', 'preview/demo.css', 'api/themes.json', 'api/config/lagoon.json', 'themes/lagoon/scene.js', 'themes/lagoon/preview.png', '.nojekyll']) {
    assert.ok(fs.existsSync(path.join(out, rel)), rel);
  }
  assert.ok(!fs.existsSync(path.join(out, 'themes', 'lagoon', 'terminal')));
  const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /(src|href)="\//, 'paths must be relative so the site works under a sub-path');
});

test('parseValue turns --set strings into numbers, booleans and JSON', () => {
  assert.equal(preview.parseValue('6'), 6);
  assert.equal(preview.parseValue('true'), true);
  assert.deepEqual(preview.parseValue('{"a":1}'), { a: 1 });
  assert.equal(preview.parseValue('braille'), 'braille');
});
