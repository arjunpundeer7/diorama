'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { runtimeTheme, runtimeSkin } = require('./catalog');

const BROWSER_DIR = path.join(__dirname, '..', '..', 'runtime');
const browserFile = (name) => path.join(BROWSER_DIR, name);
const readBrowserFile = (name) => fs.readFileSync(browserFile(name), 'utf8');

const runtimeSource = () => readBrowserFile('runtime.js');
const rendererSource = () => readBrowserFile('renderer.js');

function mountConfig({ theme, skins, renderer, options }) {
  const { set, ...rest } = options || {};
  const base = runtimeTheme(theme);
  const config = {
    theme: { ...base, options: { ...base.options, ...(set || {}) } },
    skins: skins.map(runtimeSkin),
    renderer: renderer || {},
    options: rest,
  };
  config.key = crypto.createHash('sha256').update(JSON.stringify(config)).digest('hex').slice(0, 16);
  return config;
}

function mountCall(config) {
  return `;(() => { if (globalThis.DIORAMA) globalThis.DIORAMA.mount(${JSON.stringify(config)}); })();\n`;
}

function injectionScript(config) {
  return runtimeSource() + '\n' + mountCall(config);
}

function rendererBundle(theme) {
  return [rendererSource(), readBrowserFile('engine.js'), fs.readFileSync(theme.scenePath, 'utf8')].join('\n;');
}

function rendererPage(theme) {
  const code = rendererBundle(theme).replace(/<\/(script)/gi, '<\\/$1');
  const hash = crypto.createHash('sha256').update(code, 'utf8').digest('base64');
  const csp = `default-src 'none'; script-src 'sha256-${hash}'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:`;
  return (
    '<!doctype html>\n<html>\n<head>\n<meta charset="utf-8">\n' +
    `<meta http-equiv="Content-Security-Policy" content="${csp}">\n` +
    '<title>diorama renderer</title>\n</head>\n<body>\n' +
    `<script>${code}</script>\n` +
    '</body>\n</html>\n'
  );
}

module.exports = {
  BROWSER_DIR,
  browserFile,
  runtimeSource,
  rendererSource,
  mountConfig,
  mountCall,
  injectionScript,
  rendererBundle,
  rendererPage,
};
