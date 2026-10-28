'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { VERSION } = require('./version');
const { userHome } = require('./catalog');
const { BROWSER_DIR, mountConfig, mountCall, rendererPage } = require('./payload');

const MARK_START = '<!-- diorama:start -->';
const MARK_END = '<!-- diorama:end -->';
const DIR = 'diorama';
const BLOCK =
  `${MARK_START}\n` +
  `<script src="./${DIR}/runtime.js"></script>\n` +
  `<script src="./${DIR}/config.js"></script>\n` +
  `${MARK_END}\n`;
const BLOCK_RE = /<!-- diorama:start -->[\s\S]*?<!-- diorama:end -->\r?\n?/g;
const KNOWN_HTML = ['vs/code/electron-browser/workbench/workbench.html', 'vs/code/electron-sandbox/workbench/workbench.html'];

class PatchError extends Error {
  constructor(message, hint) {
    super(message);
    this.name = 'PatchError';
    this.hint = hint;
  }
}

const checksum = (text) => crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('base64').replace(/=+$/, '');
const isPatched = (html) => html.includes(MARK_START);
const strip = (html) => html.replace(BLOCK_RE, '');

function inject(html) {
  const clean = strip(html);
  const at = clean.lastIndexOf('</html>');
  return at === -1 ? clean + '\n' + BLOCK : clean.slice(0, at) + BLOCK + clean.slice(at);
}

function locate(appRoot) {
  const productPath = path.join(appRoot, 'product.json');
  if (!fs.existsSync(productPath)) {
    throw new PatchError(`No product.json in ${appRoot}.`, 'Point --path at the editor\'s "resources/app" folder.');
  }
  const product = JSON.parse(fs.readFileSync(productPath, 'utf8'));
  const checksums = product.checksums || {};
  const fromChecksums = Object.keys(checksums).find((k) => /^vs\/code\/[^/]+\/workbench\/workbench\.html$/.test(k));
  const rel = fromChecksums || KNOWN_HTML.find((r) => fs.existsSync(path.join(appRoot, 'out', r)));
  if (!rel) throw new PatchError(`Could not find workbench.html under ${appRoot}.`);
  const htmlPath = path.join(appRoot, 'out', ...rel.split('/'));
  if (!fs.existsSync(htmlPath)) throw new PatchError(`Expected ${htmlPath} to exist.`);
  let version = product.version;
  if (!version) {
    try {
      version = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8')).version;
    } catch {
      version = 'unknown';
    }
  }
  return {
    appRoot,
    name: product.nameShort || product.applicationName || 'editor',
    version,
    commit: product.commit || null,
    productPath,
    htmlPath,
    checksumKey: fromChecksums || null,
    themDir: path.join(path.dirname(htmlPath), DIR),
  };
}

function assertWritable(file) {
  try {
    fs.closeSync(fs.openSync(file, 'r+'));
  } catch (err) {
    if (err.code === 'EACCES' || err.code === 'EPERM') {
      throw new PatchError(
        `No permission to modify ${file}.`,
        process.platform === 'win32'
          ? 'The editor is installed for all users. Run the command from an Administrator terminal, or reinstall the editor with the per-user installer.'
          : process.platform === 'darwin'
            ? 'Give your terminal "App Management" permission (System Settings > Privacy & Security), then try again.'
            : 'Run with sudo, or use an install the current user owns. Snap and AppImage installs are read-only.',
      );
    }
    throw err;
  }
}

function setChecksum(loc, html) {
  if (!loc.checksumKey) return;
  const text = fs.readFileSync(loc.productPath, 'utf8');
  const current = JSON.parse(text).checksums[loc.checksumKey];
  const next = checksum(html);
  if (current === next) return;
  const quoted = JSON.stringify(current);
  if (!text.includes(quoted)) return;
  fs.writeFileSync(loc.productPath, text.replace(quoted, JSON.stringify(next)));
}

function backupOnce(loc, html) {
  if (isPatched(html)) return null;
  const dir = path.join(userHome(), 'backups', `${loc.name}-${loc.version}`.replace(/[^\w.-]+/g, '_'));
  if (fs.existsSync(dir)) return dir;
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(loc.htmlPath, path.join(dir, 'workbench.html'));
  fs.copyFileSync(loc.productPath, path.join(dir, 'product.json'));
  fs.writeFileSync(path.join(dir, 'source.txt'), `${loc.htmlPath}\n${loc.productPath}\n`);
  return dir;
}

function apply({ appRoot, theme, skins, options }) {
  const loc = locate(appRoot);
  assertWritable(loc.htmlPath);
  if (loc.checksumKey) assertWritable(loc.productPath);

  const html = fs.readFileSync(loc.htmlPath, 'utf8');
  const backup = backupOnce(loc, html);

  fs.rmSync(loc.themDir, { recursive: true, force: true });
  fs.mkdirSync(loc.themDir, { recursive: true });
  fs.copyFileSync(path.join(BROWSER_DIR, 'runtime.js'), path.join(loc.themDir, 'runtime.js'));
  fs.writeFileSync(path.join(loc.themDir, 'renderer.html'), rendererPage(theme));

  const config = mountConfig({ theme, skins, renderer: { url: `./${DIR}/renderer.html` }, options });
  fs.writeFileSync(
    path.join(loc.themDir, 'config.js'),
    `// Generated by diorama ${VERSION}. Run \`diorama apply\` again instead of editing this file.\n${mountCall(config)}`,
  );
  const manifest = {
    tool: VERSION,
    theme: theme.id,
    skins: skins.map((k) => k.id),
    options: options || {},
    appVersion: loc.version,
    appliedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(loc.themDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  const patched = inject(html);
  fs.writeFileSync(loc.htmlPath, patched);
  setChecksum(loc, patched);
  return { ...loc, backup, manifest };
}

function restore({ appRoot }) {
  const loc = locate(appRoot);
  const html = fs.readFileSync(loc.htmlPath, 'utf8');
  const hadDir = fs.existsSync(loc.themDir);
  if (!isPatched(html) && !hadDir) return { ...loc, changed: false };
  assertWritable(loc.htmlPath);
  const original = strip(html);
  if (original !== html) fs.writeFileSync(loc.htmlPath, original);
  if (loc.checksumKey) {
    assertWritable(loc.productPath);
    setChecksum(loc, original);
  }
  fs.rmSync(loc.themDir, { recursive: true, force: true });
  return { ...loc, changed: true };
}

function status({ appRoot }) {
  const loc = locate(appRoot);
  const html = fs.readFileSync(loc.htmlPath, 'utf8');
  let manifest = null;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(loc.themDir, 'manifest.json'), 'utf8'));
  } catch {
  }
  let checksumOk = true;
  if (loc.checksumKey) {
    const stored = JSON.parse(fs.readFileSync(loc.productPath, 'utf8')).checksums[loc.checksumKey];
    checksumOk = stored === checksum(html);
  }
  return { ...loc, patched: isPatched(html), manifest, checksumOk };
}

module.exports = { apply, restore, status, locate, inject, strip, checksum, isPatched, PatchError, MARK_START, MARK_END };
