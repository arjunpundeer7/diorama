(() => {
  'use strict';
  if (globalThis.diorama && globalThis.diorama.renderer) return;

  let def = null;
  let cfg = null;
  let env = null;
  let canvas = null;
  let started = false;
  let paused = false;
  let raf = 0;
  let last = 0;
  let frameNo = 0;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  globalThis.diorama = Object.assign(globalThis.diorama || {}, {
    renderer: '0.1.0',
    scene(definition) {
      def = definition;
      start();
    },
  });

  const post = (msg) => parent.postMessage(Object.assign({ diorama: 1 }, msg), '*');
  const fail = (err) => post({ type: 'error', message: String((err && err.stack) || err) });

  function prepareDocument() {
    const doc = document;
    if (!doc.body) doc.documentElement.appendChild(doc.createElement('body'));
    const style = doc.createElement('style');
    style.textContent =
      'html,body{margin:0;height:100%;overflow:hidden;background:transparent}' +
      'canvas{position:fixed;inset:0;width:100%;height:100%;display:block}';
    (doc.head || doc.documentElement).appendChild(style);
    canvas = doc.createElement('canvas');
    doc.body.appendChild(canvas);
  }

  function resizeCanvas() {
    const scale = Math.min(devicePixelRatio || 1, 2) * Math.min(cfg.theme.resolution || 1, 2);
    env.width = innerWidth;
    env.height = innerHeight;
    env.dpr = scale;
    canvas.width = Math.max(1, Math.round(innerWidth * scale));
    canvas.height = Math.max(1, Math.round(innerHeight * scale));
  }

  function call(name, ...args) {
    if (!def || typeof def[name] !== 'function') return true;
    try {
      def[name](...args);
      return true;
    } catch (err) {
      stop();
      fail(err);
      return false;
    }
  }

  function start() {
    if (started || !def || !cfg) return;
    started = true;
    paused = !!cfg.paused;
    env = {
      canvas,
      width: 0,
      height: 0,
      dpr: 1,
      scheme: cfg.scheme,
      palette: cfg.palette,
      options: cfg.theme.options || {},
      reducedMotion: reducedMotion.matches,
    };
    resizeCanvas();
    if (!call('setup', env)) return;

    addEventListener('resize', () => {
      resizeCanvas();
      if (call('resize', env) && !running()) drawOnce();
    });
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : loop()));
    reducedMotion.addEventListener('change', () => {
      env.reducedMotion = reducedMotion.matches;
      if (env.reducedMotion) {
        stop();
        drawOnce();
      } else loop();
    });

    post({ type: 'ready' });
    drawOnce();
    loop();
  }

  const running = () => raf !== 0;

  function draw(now, dt) {
    if (innerWidth !== env.width || innerHeight !== env.height) {
      resizeCanvas();
      if (!call('resize', env)) return;
    }
    call('frame', { t: now / 1000, dt, frame: frameNo++ }, env);
  }

  function drawOnce() {
    draw(performance.now(), 0);
  }

  function loop() {
    if (raf || paused || document.hidden || env.reducedMotion) return;
    const interval = 1000 / Math.max(1, Math.min(cfg.fps || 30, 120));
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      if (last && now - last < interval - 2) return;
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      draw(now, dt);
    };
    raf = requestAnimationFrame(tick);
  }

  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
  }

  addEventListener('message', (e) => {
    if (e.source !== parent) return;
    const m = e.data;
    if (!m || m.diorama !== 1) return;
    if (m.type === 'config') {
      cfg = m;
      start();
    } else if (m.type === 'scheme' && env) {
      env.scheme = m.scheme;
      env.palette = m.palette;
      if (call('scheme', env) && !running()) drawOnce();
    } else if (m.type === 'pause' && env) {
      paused = true;
      stop();
    } else if (m.type === 'resume' && env) {
      paused = false;
      loop();
    }
  });

  prepareDocument();

  const id = new URLSearchParams(location.search).get('theme');
  if (id && /^[a-z0-9][a-z0-9-]*$/.test(id)) {
    for (const src of ['engine.js', `themes/${id}/scene.js`]) {
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.onerror = () => fail(`could not load ${src}`);
      document.head.appendChild(script);
    }
  }

  post({ type: 'hello' });
})();
