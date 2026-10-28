'use strict';

const fs = require('node:fs');
const path = require('node:path');
const core = require('./src/core');

function appRoots() {
  const dir = path.dirname(process.execPath);
  const candidates = [
    path.join(dir, 'resources', 'app'),
    path.join(dir, '..', 'Resources', 'app'),
  ];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) candidates.push(path.join(dir, entry.name, 'resources', 'app'));
  }
  return candidates.filter((p) => fs.existsSync(path.join(p, 'product.json')));
}

for (const appRoot of appRoots()) {
  try {
    core.workbench.restore({ appRoot });
  } catch {
  }
}
