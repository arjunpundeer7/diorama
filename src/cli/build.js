'use strict';

const fs = require('node:fs');
const path = require('node:path');
const core = require('../core');
const { UserError } = require('./ui');
const { apiFiles, PREVIEW_DIR } = require('./preview');

const ROOT = core.repoRoot();
const RUNTIME_FILES = ['runtime.js', 'renderer.js', 'engine.js', 'renderer.html'];

function fresh(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function copy(from, to, skip = []) {
  if (fs.statSync(from).isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    for (const name of fs.readdirSync(from)) {
      if (!skip.includes(name)) copy(path.join(from, name), path.join(to, name), skip);
    }
  } else {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
}

function checked(catalog) {
  if (catalog.errors.length) {
    const lines = catalog.errors.map((e) => `  ${e.file}: ${e.problems.join('; ')}`);
    throw new UserError(`Some themes or skins are invalid:\n${lines.join('\n')}`);
  }
  return catalog;
}

function toMatchPattern(url) {
  const m = /^(https?):\/\/([^/]+)(\/.*)$/.exec(url);
  if (!m) throw new UserError(`Skin URL "${url}" cannot be used by a browser extension. Use https://host/path*.`);
  return `${m[1]}://${m[2]}${m[3]}`;
}

function buildExtension({ out, catalog }) {
  checked(catalog);
  fresh(out);
  const themes = catalog.themes();
  const skins = catalog.webSkins();
  const matches = [...new Set(skins.flatMap((k) => k.match.urls.filter((u) => /^https?:/.test(u)).map(toMatchPattern)))];

  for (const f of RUNTIME_FILES) copy(path.join(core.payload.BROWSER_DIR, f), path.join(out, f));
  for (const t of themes) copy(t.dir, path.join(out, 'themes', t.id), ['terminal']);
  for (const f of ['content.js', 'popup.html', 'popup.js', 'popup.css']) copy(path.join(ROOT, 'extension', f), path.join(out, f));

  const data = {
    themes: Object.fromEntries(
      themes.map((t) => [t.id, { ...core.runtimeTheme(t), description: t.description || '', preview: fs.existsSync(path.join(t.dir, 'preview.png')) }]),
    ),
    skins: skins.map((k) => ({ ...core.runtimeSkin(k), name: k.name, status: k.status || 'draft' })),
  };
  fs.writeFileSync(path.join(out, 'catalog.js'), `self.DIORAMA_CATALOG = ${JSON.stringify(data, null, 2)};\n`);

  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'extension', 'manifest.base.json'), 'utf8'));
  manifest.version = core.VERSION;
  manifest.content_scripts = [{ matches, js: ['runtime.js', 'catalog.js', 'content.js'], run_at: 'document_start' }];
  manifest.web_accessible_resources = [{ resources: ['renderer.html', 'renderer.js', 'engine.js', 'themes/*'], matches }];
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return { out, themes: themes.length, skins: skins.length, matches };
}

function buildVscode({ out, catalog }) {
  checked(catalog);
  fresh(out);
  for (const f of ['extension.js', 'uninstall.js', 'package.json', 'README.md']) copy(path.join(ROOT, 'vscode', f), path.join(out, f));
  copy(path.join(ROOT, 'LICENSE'), path.join(out, 'LICENSE'));
  copy(path.join(ROOT, 'src', 'core'), path.join(out, 'src', 'core'));
  for (const f of RUNTIME_FILES) copy(path.join(core.payload.BROWSER_DIR, f), path.join(out, 'runtime', f));
  const themes = catalog.themes();
  for (const t of themes) copy(t.dir, path.join(out, 'themes', t.id), ['preview.png']);
  for (const k of catalog.skins()) {
    copy(k.file, path.join(out, 'skins', path.basename(k.file)));
    const css = k.stylesheet && path.join(path.dirname(k.file), k.stylesheet);
    if (css && fs.existsSync(css)) copy(css, path.join(out, 'skins', k.stylesheet));
  }
  return { out, themes: themes.length, skins: catalog.skins().length };
}

function buildSite({ out, catalog }) {
  checked(catalog);
  fresh(out);
  copy(path.join(PREVIEW_DIR, 'index.html'), path.join(out, 'index.html'));
  copy(path.join(PREVIEW_DIR, 'gallery.html'), path.join(out, 'gallery.html'));
  copy(PREVIEW_DIR, path.join(out, 'preview'), ['index.html', 'gallery.html', 'skin.json']);
  for (const f of RUNTIME_FILES) copy(path.join(core.payload.BROWSER_DIR, f), path.join(out, f));
  const themes = catalog.themes();
  for (const t of themes) copy(t.dir, path.join(out, 'themes', t.id), ['terminal']);
  for (const [rel, body] of Object.entries(apiFiles(catalog))) {
    fs.mkdirSync(path.dirname(path.join(out, rel)), { recursive: true });
    fs.writeFileSync(path.join(out, rel), body);
  }
  fs.writeFileSync(path.join(out, '.nojekyll'), '');
  return { out, themes: themes.length };
}

module.exports = { buildExtension, buildVscode, buildSite, copy };
