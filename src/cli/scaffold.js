'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { copy } = require('./build');
const { UserError } = require('./ui');

const ID = /^[a-z0-9][a-z0-9-]*$/;

function checkId(kind, id) {
  if (!id || !ID.test(id)) throw new UserError(`Give the ${kind} an id of lowercase letters, digits and dashes, e.g. "my-${kind}".`);
}

const titleCase = (id) => id.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

function newTheme({ id, from, dir }) {
  checkId('theme', id);
  if (!from) throw new UserError('No theme to start from.');
  const target = path.resolve(dir, id);
  if (fs.existsSync(target)) throw new UserError(`${target} already exists.`);
  copy(from.dir, target, ['preview.png']);
  const file = path.join(target, 'theme.json');
  const theme = JSON.parse(fs.readFileSync(file, 'utf8'));
  delete theme.$schema;
  Object.assign(theme, { id, name: titleCase(id), version: '0.1.0', description: `Based on ${from.name}.` });
  fs.writeFileSync(file, JSON.stringify(theme, null, 2) + '\n');
  return target;
}

function newSkin({ id, url, home }) {
  checkId('skin', id);
  if (!url) throw new UserError('Say which pages the skin is for with --url, e.g. --url "https://example.com/*".');
  const file = path.join(home, 'skins', `${id}.json`);
  if (fs.existsSync(file)) throw new UserError(`${file} already exists.`);
  const skin = {
    id,
    name: titleCase(id),
    match: { urls: [url] },
    slots: [
      { name: 'app', role: 'clear', required: true, selectors: ['body > *'] },
      { name: 'panels', role: 'glass', selectors: ['nav', 'aside'] },
    ],
    status: 'draft',
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(skin, null, 2) + '\n');
  return file;
}

function newApp({ id, exe, skin, name, home }) {
  checkId('app', id);
  if (!exe || !fs.existsSync(exe)) throw new UserError('Point --exe at the app\'s executable.');
  const file = path.join(home, 'apps.json');
  let list = [];
  try {
    list = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    list = [];
  }
  list = list.filter((a) => a.id !== id);
  list.push({ id, name: name || titleCase(id), kind: 'electron', exe: path.resolve(exe), skins: skin ? [skin] : [] });
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(list, null, 2) + '\n');
  return file;
}

module.exports = { newTheme, newSkin, newApp };
