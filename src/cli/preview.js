'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const core = require('../core');
const apps = require('./apps');
const { Connection, waitForEndpoint, sleep } = require('./cdp');
const { freePort, cleanEnv } = require('./launch');
const { UserError } = require('./ui');

const PREVIEW_DIR = path.join(core.repoRoot(), 'preview');
const RUNTIME_FILES = new Set(['runtime.js', 'renderer.js', 'renderer.html', 'engine.js']);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

function inside(dir, rel) {
  const full = path.resolve(dir, '.' + path.sep + rel);
  return full.startsWith(path.resolve(dir) + path.sep) ? full : null;
}

function parseValue(v) {
  if (v === 'true' || v === 'false') return v === 'true';
  if (v !== '' && !Number.isNaN(Number(v))) return Number(v);
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

function themeSummary(t) {
  return {
    id: t.id,
    name: t.name,
    description: t.description || '',
    tagline: t.tagline || '',
    mark: (t.options && t.options.mark) || '',
    scheme: t.scheme || 'light',
    fps: t.fps || 30,
    preview: fs.existsSync(path.join(t.dir, 'preview.png')),
  };
}

function apiFiles(catalog, set = {}) {
  const skin = JSON.parse(fs.readFileSync(path.join(PREVIEW_DIR, 'skin.json'), 'utf8'));
  const files = { 'api/themes.json': JSON.stringify(catalog.themes().map(themeSummary)) };
  for (const theme of catalog.themes()) {
    const config = core.payload.mountConfig({
      theme,
      skins: [skin],
      renderer: { url: `renderer.html?theme=${theme.id}` },
      options: { frame: true, set },
    });
    files[`api/config/${theme.id}.json`] = JSON.stringify(config);
  }
  return files;
}

function startServer({ catalog, port = 0, set = {} }) {
  const send = (res, status, body, type = 'text/plain; charset=utf-8') => {
    res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(body);
  };
  const sendFile = (res, file) => {
    if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, 'not found');
    send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || 'application/octet-stream');
  };

  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (p === '/' || p === '/index.html') return sendFile(res, path.join(PREVIEW_DIR, 'index.html'));
    if (p === '/gallery' || p === '/gallery.html') return sendFile(res, path.join(PREVIEW_DIR, 'gallery.html'));
    if (p.startsWith('/preview/')) return sendFile(res, inside(PREVIEW_DIR, p.slice(9)));
    if (RUNTIME_FILES.has(p.slice(1))) return sendFile(res, path.join(core.payload.BROWSER_DIR, p.slice(1)));
    if (p.startsWith('/api/')) {
      const body = apiFiles(catalog, set)[p.slice(1)];
      return body ? send(res, 200, body, TYPES['.json']) : send(res, 404, 'not found');
    }
    const m = /^\/themes\/([a-z0-9][a-z0-9-]*)\/(.+)$/.exec(p);
    if (m) {
      const theme = catalog.theme(m[1]);
      return sendFile(res, theme && inside(theme.dir, m[2]));
    }
    send(res, 404, 'not found');
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => {
      resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

function findBrowser(explicit) {
  if (explicit) {
    if (!fs.existsSync(explicit)) throw new UserError(`No browser at ${explicit}.`);
    return explicit;
  }
  for (const id of ['chrome', 'edge']) {
    const app = apps.detect(apps.byId(id));
    if (app.installed) return app.exe;
  }
  throw new UserError('Screenshots need Chrome or Edge.', 'Pass a Chromium-based browser with --browser <file>.');
}

async function screenshot({ url, file, width = 1440, height = 900, scale = 1, wait = 4, browser }) {
  const exe = findBrowser(browser);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'diorama-shot-'));
  const port = await freePort();
  const child = spawn(
    exe,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      `--window-size=${width},${height}`,
      `--force-device-scale-factor=${scale}`,
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ],
    { stdio: 'ignore', env: cleanEnv() },
  );
  const exited = new Promise((resolve) => child.once('exit', resolve));
  try {
    const version = await waitForEndpoint(port, { timeoutMs: 30000 });
    if (!version) throw new UserError('The browser did not start for the screenshot.');
    const conn = await Connection.connect(version.webSocketDebuggerUrl);
    const { targetId } = await conn.send('Target.createTarget', { url });
    const { sessionId } = await conn.send('Target.attachToTarget', { targetId, flatten: true });
    await conn.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false }, sessionId);
    await sleep(wait * 1000);
    const probe = await conn.send('Runtime.evaluate', { expression: 'globalThis.DIORAMA ? DIORAMA.report() : null', returnByValue: true }, sessionId);
    const report = probe.result && probe.result.value;
    const { data } = await conn.send('Page.captureScreenshot', { format: 'png' }, sessionId);
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    await conn.send('Browser.close').catch(() => {});
    conn.close();
    return { file: path.resolve(file), report };
  } finally {
    await Promise.race([exited, sleep(5000)]);
    child.kill();
    await Promise.race([exited, sleep(3000)]);
    try {
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    } catch {
      setTimeout(() => fs.rm(profile, { recursive: true, force: true }, () => {}), 2000).unref();
    }
  }
}

function openInBrowser(url) {
  const cmd = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '""', `"${url}"`] : [url];
  spawn(cmd, args, { detached: true, stdio: 'ignore', windowsVerbatimArguments: true }).unref();
}

module.exports = { startServer, apiFiles, screenshot, openInBrowser, parseValue, themeSummary, PREVIEW_DIR, RUNTIME_FILES };
