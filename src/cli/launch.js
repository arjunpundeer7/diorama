'use strict';

const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { payload } = require('../core');
const { Connection, waitForEndpoint, sleep } = require('./cdp');
const procs = require('./procs');
const { UserError } = require('./ui');

const FRAME_NAME = 'diorama-renderer';
const SKIP_URL = /^(devtools|chrome-extension|chrome-untrusted|edge|chrome):/;

const INHERITED = /^(ELECTRON_RUN_AS_NODE|ELECTRON_NO_ATTACH_CONSOLE|ELECTRON_NO_ASAR|CHROME_CRASHPAD_PIPE_NAME|VSCODE_.*)$/i;

function cleanEnv() {
  return Object.fromEntries(Object.entries(process.env).filter(([k]) => !INHERITED.test(k)));
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

class Injector {
  constructor(conn, { script, bundle, log }) {
    this.conn = conn;
    this.script = script;
    this.bundle = bundle;
    this.log = log;
    this.targets = new Set();
    this.sessions = new Map();
    this.timers = new Map();
  }

  async start() {
    this.conn.on((msg) => this.onEvent(msg));
    await this.conn.send('Target.setDiscoverTargets', { discover: true });
    const { targetInfos } = await this.conn.send('Target.getTargets');
    await Promise.all(targetInfos.map((t) => this.consider(t)));
  }

  onEvent(msg) {
    const p = msg.params || {};
    switch (msg.method) {
      case 'Target.targetCreated':
      case 'Target.targetInfoChanged':
        this.consider(p.targetInfo);
        break;
      case 'Target.targetDestroyed':
        this.targets.delete(p.targetId);
        break;
      case 'Target.detachedFromTarget':
        this.sessions.delete(p.sessionId);
        break;
      case 'Page.frameAttached':
      case 'Page.frameNavigated':
        if (msg.sessionId) this.scheduleScan(msg.sessionId);
        break;
      case 'Page.frameDetached': {
        const session = this.sessions.get(msg.sessionId);
        if (session) session.frames.delete(p.frameId);
        break;
      }
    }
  }

  async consider(t) {
    if (!t || t.type !== 'page' || this.targets.has(t.targetId) || SKIP_URL.test(t.url)) return;
    this.targets.add(t.targetId);
    try {
      await this.inject(t);
    } catch (err) {
      this.log(`could not theme ${t.url}: ${err.message}`);
    }
  }

  async inject(t) {
    const send = (m, p) => this.conn.send(m, p, sessionId);
    const { sessionId } = await this.conn.send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
    const session = { sessionId, targetId: t.targetId, frames: new Set() };
    this.sessions.set(sessionId, session);
    await send('Page.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: this.script });
    const res = await send('Runtime.evaluate', { expression: this.script });
    if (res.exceptionDetails) this.log(`runtime error in ${t.url}: ${res.exceptionDetails.text}`);
    await this.scan(session);
  }

  scheduleScan(sessionId) {
    clearTimeout(this.timers.get(sessionId));
    this.timers.set(
      sessionId,
      setTimeout(() => {
        const session = this.sessions.get(sessionId);
        if (session) this.scan(session).catch(() => {});
      }, 30),
    );
  }

  async scan(session) {
    const send = (m, p) => this.conn.send(m, p, session.sessionId);
    const { frameTree } = await send('Page.getFrameTree');
    const found = [];
    (function walk(node) {
      if (node.frame.name === FRAME_NAME) found.push(node.frame.id);
      for (const child of node.childFrames || []) walk(child);
    })(frameTree);
    for (const frameId of found) {
      if (session.frames.has(frameId)) continue;
      session.frames.add(frameId);
      try {
        const { executionContextId } = await send('Page.createIsolatedWorld', { frameId, worldName: FRAME_NAME });
        const res = await send('Runtime.evaluate', { expression: this.bundle, contextId: executionContextId });
        if (res.exceptionDetails) this.log(`theme error: ${res.exceptionDetails.text}`);
      } catch (err) {
        session.frames.delete(frameId);
        this.log(`could not start the background frame: ${err.message}`);
      }
    }
  }

  async evaluateAll(expression) {
    const results = [];
    for (const session of this.sessions.values()) {
      try {
        const res = await this.conn.send('Runtime.evaluate', { expression, returnByValue: true }, session.sessionId);
        results.push({ session, value: res.result && res.result.value });
      } catch {
      }
    }
    return results;
  }

  report() {
    return this.evaluateAll('globalThis.DIORAMA ? globalThis.DIORAMA.report() : { mounted: false, url: location.href }');
  }

  inspect() {
    return this.evaluateAll('globalThis.DIORAMA ? { url: location.href, blockers: globalThis.DIORAMA.inspect() } : null');
  }

  async screenshot(file) {
    const reports = await this.report();
    const target = reports.find((r) => r.value && r.value.mounted) || reports[0];
    if (!target) return null;
    const { data } = await this.conn.send('Page.captureScreenshot', { format: 'png' }, target.session.sessionId);
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    return file;
  }
}

async function launch(o) {
  const { app, theme, skins, log = () => {} } = o;
  const exe = o.exe || app.exe;
  if (!exe || !fs.existsSync(exe)) {
    throw new UserError(`Could not find ${app.name}.`, 'Pass the executable with --exe <file>.');
  }

  let userDataDir = o.userDataDir;
  if (!userDataDir && app.kind === 'browser') {
    userDataDir = path.join(o.home, 'profiles', app.id);
  }
  if (!userDataDir) {
    const running = procs.findMain(exe);
    if (running.length && !o.restart) {
      throw new UserError(
        `${app.name} is already running.`,
        'Quit it completely (including from the tray) and run this again, or pass --restart to have diorama quit it for you.',
      );
    }
    if (running.length) {
      log(`quitting ${app.name}...`);
      await procs.stop(running);
    }
  }

  const port = o.port || (await freePort());
  const args = [`--remote-debugging-port=${port}`];
  if (userDataDir) args.push(`--user-data-dir=${userDataDir}`);
  if (app.kind === 'browser') args.push('--no-first-run', '--no-default-browser-check');
  args.push(...(o.args || []));
  if (app.kind === 'browser' && o.url) args.push(o.url);

  const child = spawn(exe, args, { detached: true, stdio: 'ignore', env: cleanEnv() });
  child.on('error', () => {});
  child.unref();
  let exitedAt = 0;
  child.on('exit', () => (exitedAt = Date.now()));

  const version = await waitForEndpoint(port, { timeoutMs: 45000, gaveUp: () => exitedAt && Date.now() - exitedAt > 5000 });
  if (!version) {
    throw new UserError(
      `${app.name} did not open a DevTools port.`,
      exitedAt
        ? 'It exited right away. Either another copy is running (quit it, or pass --restart) or the app refuses debugger attachment.'
        : 'It may be blocking debugger attachment.',
    );
  }

  const conn = await Connection.connect(version.webSocketDebuggerUrl);
  const config = payload.mountConfig({ theme, skins, renderer: {}, options: o.options });
  const injector = new Injector(conn, {
    script: payload.injectionScript(config),
    bundle: payload.rendererBundle(theme),
    log,
  });
  await injector.start();
  return { conn, injector, port, product: version.Browser, closed: conn.closed };
}

module.exports = { launch, freePort, sleep, cleanEnv, FRAME_NAME };
