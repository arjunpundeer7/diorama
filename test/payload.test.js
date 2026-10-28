'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/core');
const { ROOT } = require('./helpers');

const catalog = core.createCatalog({ roots: [ROOT] });
const theme = catalog.theme('lagoon');
const skins = [catalog.skin('vscode')];

test('--set overrides land in the theme options, not the runtime options', () => {
  const config = core.payload.mountConfig({ theme, skins, options: { fps: 20, set: { mark: 'braille', turtles: 6 } } });
  assert.equal(config.theme.options.mark, 'braille');
  assert.equal(config.theme.options.turtles, 6);
  assert.equal(config.theme.options.fish, theme.options.fish);
  assert.equal(config.options.fps, 20);
  assert.equal(config.options.set, undefined);
});

test('different overrides give different mount keys', () => {
  const a = core.payload.mountConfig({ theme, skins, options: { set: { mark: 'ascii' } } });
  const b = core.payload.mountConfig({ theme, skins, options: { set: { mark: 'halftone' } } });
  assert.notEqual(a.key, b.key);
});

test('the renderer bundle carries the engine before the scene', () => {
  const bundle = core.payload.rendererBundle(theme);
  const engine = bundle.indexOf('diorama.grid');
  const scene = bundle.indexOf('diorama.scene({');
  assert.ok(engine > 0 && scene > engine);
});

test('every theme scene parses', () => {
  for (const t of catalog.themes()) {
    assert.doesNotThrow(() => new Function(core.payload.rendererBundle(t)), t.id);
  }
});
