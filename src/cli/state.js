'use strict';

const fs = require('node:fs');
const path = require('node:path');

function file(home) {
  return path.join(home, 'state.json');
}

function load(home) {
  try {
    return JSON.parse(fs.readFileSync(file(home), 'utf8'));
  } catch {
    return { editors: {}, terminals: {} };
  }
}

function save(home, state) {
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(file(home), JSON.stringify(state, null, 2) + '\n');
}

function update(home, fn) {
  const state = load(home);
  state.editors = state.editors || {};
  state.terminals = state.terminals || {};
  fn(state);
  save(home, state);
  return state;
}

module.exports = { load, save, update };
