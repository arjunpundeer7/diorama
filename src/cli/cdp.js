'use strict';

class CdpError extends Error {}

class Connection {
  static async connect(url) {
    if (typeof WebSocket !== 'function') throw new Error('diorama launch needs Node 22 or newer (built-in WebSocket).');
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = () => reject(new Error(`Could not connect to ${url}`));
    });
    return new Connection(ws);
  }

  constructor(ws) {
    this.ws = ws;
    this.nextId = 0;
    this.pending = new Map();
    this.handlers = new Set();
    this.closed = new Promise((resolve) => {
      ws.onclose = () => {
        for (const p of this.pending.values()) p.reject(new CdpError(`${p.method}: connection closed`));
        this.pending.clear();
        resolve();
      };
    });
    ws.onerror = () => {};
    ws.onmessage = (e) => this.receive(JSON.parse(typeof e.data === 'string' ? e.data : Buffer.from(e.data).toString()));
  }

  receive(msg) {
    if (msg.id === undefined) {
      for (const handler of this.handlers) handler(msg);
      return;
    }
    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);
    if (msg.error) p.reject(new CdpError(`${p.method}: ${msg.error.message}`));
    else p.resolve(msg.result);
  }

  send(method, params = {}, sessionId) {
    const id = ++this.nextId;
    const msg = { id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      try {
        this.ws.send(JSON.stringify(msg));
      } catch (err) {
        this.pending.delete(id);
        reject(err);
      }
    });
  }

  on(handler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  close() {
    try {
      this.ws.close();
    } catch {
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForEndpoint(port, { timeoutMs = 30000, gaveUp } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return await res.json();
    } catch {
    }
    if (gaveUp && gaveUp()) return null;
    await sleep(300);
  }
  return null;
}

module.exports = { Connection, CdpError, waitForEndpoint, sleep };
