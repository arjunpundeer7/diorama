'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function tempDir(t, name = 'diorama-test-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), name));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function loadRuntime() {
  const context = {};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'runtime/runtime.js'), 'utf8'), context);
  return context.DIORAMA;
}

module.exports = { ROOT, tempDir, loadRuntime };
