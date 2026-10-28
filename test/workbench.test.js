'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../src/core');
const { ROOT, tempDir } = require('./helpers');

const REL = 'vs/code/electron-browser/workbench/workbench.html';
const HTML = `<!DOCTYPE html>
<html>
\t<head>
\t\t<meta charset="utf-8" />
\t</head>
\t<body aria-label="">
\t</body>
\t<script src="./workbench.js" type="module"></script>
</html>
`;

function fakeEditor(t) {
  const appRoot = tempDir(t, 'diorama-editor-');
  const htmlPath = path.join(appRoot, 'out', ...REL.split('/'));
  fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
  fs.writeFileSync(htmlPath, HTML);
  const product = {
    nameShort: 'Code',
    version: '1.0.0',
    checksums: { 'vs/workbench/workbench.desktop.main.js': 'abc', [REL]: core.workbench.checksum(HTML) },
  };
  fs.writeFileSync(path.join(appRoot, 'product.json'), JSON.stringify(product, null, '\t') + '\n');
  return { appRoot, htmlPath, productPath: path.join(appRoot, 'product.json') };
}

function setup(t) {
  process.env.DIORAMA_HOME = tempDir(t, 'diorama-home-');
  const catalog = core.createCatalog({ roots: [ROOT] });
  return { theme: catalog.theme('lagoon'), skins: [catalog.skin('vscode')] };
}

test('apply patches workbench.html, writes the runtime and fixes the checksum', (t) => {
  const { theme, skins } = setup(t);
  const ed = fakeEditor(t);
  const result = core.workbench.apply({ appRoot: ed.appRoot, theme, skins });

  const html = fs.readFileSync(ed.htmlPath, 'utf8');
  assert.equal(html.split(core.workbench.MARK_START).length, 2);
  assert.ok(html.indexOf(core.workbench.MARK_END) < html.indexOf('</html>'));
  for (const f of ['runtime.js', 'config.js', 'renderer.html', 'manifest.json']) {
    assert.ok(fs.existsSync(path.join(result.themDir, f)), f);
  }
  const product = JSON.parse(fs.readFileSync(ed.productPath, 'utf8'));
  assert.equal(product.checksums[REL], core.workbench.checksum(html));
  assert.equal(product.checksums['vs/workbench/workbench.desktop.main.js'], 'abc');
  assert.ok(result.backup && fs.existsSync(path.join(result.backup, 'workbench.html')));

  const status = core.workbench.status({ appRoot: ed.appRoot });
  assert.equal(status.patched, true);
  assert.equal(status.checksumOk, true);
  assert.equal(status.manifest.theme, 'lagoon');
});

test('applying twice leaves one block', (t) => {
  const { theme, skins } = setup(t);
  const ed = fakeEditor(t);
  core.workbench.apply({ appRoot: ed.appRoot, theme, skins });
  core.workbench.apply({ appRoot: ed.appRoot, theme, skins, options: { fps: 20 } });
  const html = fs.readFileSync(ed.htmlPath, 'utf8');
  assert.equal(html.split(core.workbench.MARK_START).length, 2);
  assert.equal(core.workbench.status({ appRoot: ed.appRoot }).manifest.options.fps, 20);
});

test('restore returns both files byte for byte', (t) => {
  const { theme, skins } = setup(t);
  const ed = fakeEditor(t);
  const before = [fs.readFileSync(ed.htmlPath), fs.readFileSync(ed.productPath)];
  const { themDir } = core.workbench.apply({ appRoot: ed.appRoot, theme, skins });
  const result = core.workbench.restore({ appRoot: ed.appRoot });
  assert.equal(result.changed, true);
  assert.deepEqual(fs.readFileSync(ed.htmlPath), before[0]);
  assert.deepEqual(fs.readFileSync(ed.productPath), before[1]);
  assert.equal(fs.existsSync(themDir), false);
  assert.equal(core.workbench.restore({ appRoot: ed.appRoot }).changed, false);
});

test('the renderer page allows exactly its inline script', (t) => {
  const { theme, skins } = setup(t);
  const ed = fakeEditor(t);
  const { themDir } = core.workbench.apply({ appRoot: ed.appRoot, theme, skins });
  const page = fs.readFileSync(path.join(themDir, 'renderer.html'), 'utf8');
  const script = /<script>([\s\S]*)<\/script>/.exec(page)[1];
  const hash = crypto.createHash('sha256').update(script, 'utf8').digest('base64');
  assert.ok(page.includes(`script-src 'sha256-${hash}'`));
  assert.ok(!/unsafe-inline'[^;]*script|script-src[^;]*unsafe/.test(page));
  assert.ok(script.includes('diorama.scene('), 'scene is inlined');
});

test('locate explains a folder that is not an editor', (t) => {
  assert.throws(() => core.workbench.locate(tempDir(t)), { name: 'PatchError', message: /No product.json/ });
});
