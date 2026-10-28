'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ROOT } = require('./helpers');

const context = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'runtime/engine.js'), 'utf8'), context);
const diorama = context.diorama;

test('the engine offers every mark style', () => {
  assert.deepEqual([...diorama.marks].sort(), ['ascii', 'braille', 'dither', 'halftone', 'mosaic', 'teletext']);
});

test('hash is deterministic and stays in [0, 1)', () => {
  for (let i = 0; i < 500; i++) {
    const v = diorama.hash(i, i * 7, i * 13);
    assert.ok(v >= 0 && v < 1);
    assert.equal(v, diorama.hash(i, i * 7, i * 13));
  }
  assert.notEqual(diorama.hash(1, 2, 3), diorama.hash(3, 2, 1));
});

test('noise is continuous and fbm stays in range', () => {
  for (let x = 0; x < 10; x += 0.37) {
    assert.ok(Math.abs(diorama.noise(x, 1.5) - diorama.noise(x + 0.001, 1.5)) < 0.01);
    const f = diorama.fbm(x, 2.25, 0.5, 4);
    assert.ok(f >= 0 && f <= 1);
  }
});

test('rng repeats for the same seed', () => {
  const a = diorama.rng(42);
  const b = diorama.rng(42);
  for (let i = 0; i < 20; i++) assert.equal(a(), b());
});

test('colour helpers parse and mix', () => {
  assert.deepEqual([...diorama.rgb('#ff8000')], [255, 128, 0]);
  assert.deepEqual([...diorama.rgb('#0f0')], [0, 255, 0]);
  assert.deepEqual(
    [...diorama.mix('#000000', '#ffffff', 0.5)].map(Math.round),
    [128, 128, 128],
  );
  assert.equal(diorama.css('#102030', 0.5), 'rgba(16,32,48,0.5)');
});
