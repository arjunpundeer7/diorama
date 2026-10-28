'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/core');
const { ROOT, loadRuntime } = require('./helpers');

const DIORAMA = loadRuntime();
const catalog = core.createCatalog({ roots: [ROOT] });
const skins = catalog.skins().map(core.runtimeSkin);

test('pickSkin chooses by URL', () => {
  assert.equal(DIORAMA.pickSkin(skins, 'https://claude.ai/new').id, 'claude-web');
  assert.equal(DIORAMA.pickSkin(skins, 'https://chatgpt.com/c/123').id, 'chatgpt-web');
  assert.equal(DIORAMA.pickSkin(skins, 'https://example.com/'), null);
  const workbench = 'vscode-file://vscode-app/c:/Program%20Files/Code/resources/app/out/vs/code/electron-browser/workbench/workbench.html';
  assert.equal(DIORAMA.pickSkin(skins, workbench).id, 'vscode');
});

test('match.exclude keeps a skin off overlay windows', () => {
  assert.equal(DIORAMA.pickSkin(skins, 'app://-/index.html').id, 'codex-desktop');
  assert.equal(DIORAMA.pickSkin(skins, 'app://-/index.html?initialRoute=%2Fspotlight'), null);
});

test('buildCss scopes every rule to html.diorama-on and marks it important', () => {
  const skin = core.runtimeSkin(catalog.skin('vscode'));
  const css = DIORAMA.buildCss(skin, { base: '#000', glass: 'rgb(0 0 0 / .5)', glassStrong: '#111', blur: '12px' });
  const rules = css.split('\n').filter((line) => line.startsWith('html'));
  assert.ok(rules.length > 5);
  for (const rule of rules) assert.match(rule, /^html\.diorama-on/);
  assert.match(css, /--diorama-glass-strong:#111/);
  assert.match(css, /html\.diorama-on :is\(\.monaco-workbench\)\{--vscode-editor-background:transparent!important/);
  assert.match(css, /:is\(\.monaco-workbench \.part\.sidebar,\.monaco-workbench \.part\.auxiliarybar\)\{background-color:var\(--diorama-glass\)!important/);
});

test('buildCss puts :root vars on the html element itself', () => {
  const css = DIORAMA.buildCss(core.runtimeSkin(catalog.skin('claude-web')), { base: '#fff' });
  assert.match(css, /^html\.diorama-on\{--cds-surface-0:transparent!important/m);
});
