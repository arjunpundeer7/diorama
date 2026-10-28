'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT, tempDir } = require('./helpers');

function diorama(args, home) {
  return spawnSync(process.execPath, [path.join(ROOT, 'bin', 'diorama.js'), ...args], {
    encoding: 'utf8',
    env: { ...process.env, DIORAMA_HOME: home, NO_COLOR: '1' },
  });
}

test('help, list and new theme work end to end', (t) => {
  const home = tempDir(t);
  const help = diorama(['help'], home);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /diorama apply lagoon cursor vscode/);

  const list = diorama(['list'], home);
  assert.equal(list.status, 0);
  assert.match(list.stdout, /lagoon\s+Honu Lagoon/);

  const made = diorama(['new', 'theme', 'mine', '--from', 'koi'], home);
  assert.equal(made.status, 0, made.stderr);
  assert.match(diorama(['list'], home).stdout, /mine\s+Mine/);
});

test('bad input gives a message, not a stack trace', (t) => {
  const home = tempDir(t);
  for (const args of [['apply', 'nope', 'vscode'], ['apply', 'lagoon', 'nothing'], ['frobnicate'], ['apply', 'lagoon', 'vscode', '--set', 'oops']]) {
    const r = diorama(args, home);
    assert.equal(r.status, 1, args.join(' '));
    assert.doesNotMatch(r.stderr, /at .*\.js:\d+/);
  }
});
