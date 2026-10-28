(() => {
  'use strict';

  const VERSION = '0.1.0';
  const previous = globalThis.DIORAMA;
  if (previous && previous.version === VERSION) return;
  if (previous && typeof previous.unmount === 'function') previous.unmount();

  const ROOT_ID = 'diorama-root';
  const STYLE_ID = 'diorama-style';
  const ON = 'diorama-on';
  const FRAME_NAME = 'diorama-renderer';
  const SCHEME_POLL_MS = 2000;

  const DEFAULT_PALETTE = {
    light: {
      base: '#eef1f4',
      glass: 'rgb(255 255 255 / 0.55)',
      glassStrong: 'rgb(255 255 255 / 0.8)',
      border: 'rgb(255 255 255 / 0.6)',
      blur: '18px',
      scrim: 'transparent',
      accent: '#2f6fed',
      text: '#14171a',
    },
    dark: {
      base: '#0d1014',
      glass: 'rgb(18 22 28 / 0.55)',
      glassStrong: 'rgb(18 22 28 / 0.82)',
      border: 'rgb(255 255 255 / 0.08)',
      blur: '18px',
      scrim: 'transparent',
      accent: '#6ea8ff',
      text: '#e8ecf0',
    },
  };

  const BLUR = '-webkit-backdrop-filter:blur(var(--diorama-blur)) saturate(1.4)!important;backdrop-filter:blur(var(--diorama-blur)) saturate(1.4)!important';
  const ROLE_CSS = {
    clear: 'background-color:transparent!important;background-image:none!important',
    glass: `background-color:var(--diorama-glass)!important;background-image:none!important;${BLUR}`,
    strong: `background-color:var(--diorama-glass-strong)!important;background-image:none!important;${BLUR}`,
    blur: BLUR,
  };

  let s = null;

  function patternToRegExp(pattern) {
    const parts = pattern.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&'));
    return new RegExp('^' + parts.join('.*') + '$', 'i');
  }

  function skinMatches(skin, href) {
    const match = (skin && skin.match) || {};
    const hit = (patterns) => (patterns || []).some((p) => patternToRegExp(p).test(href));
    return hit(match.urls) && !hit(match.exclude);
  }

  function pickSkin(skins, href) {
    return (skins || []).find((k) => skinMatches(k, href)) || null;
  }

  const forgiving = (selectors) => `:is(${selectors.join(',')})`;
  const kebab = (key) => key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());

  function buildCss(skin, palette) {
    const on = `html.${ON}`;
    const vars = Object.entries(palette).map(([k, v]) => `--diorama-${kebab(k)}:${v}`).join(';');
    const out = [
      `${on}{${vars};background:var(--diorama-base)!important}`,
      `${on} body{background:transparent!important}`,
    ];
    if (skin.vars && skin.vars.values) {
      const decl = Object.entries(skin.vars.values).map(([k, v]) => `${k}:${v}!important`).join(';');
      const scopes = skin.vars.scope && skin.vars.scope.length ? skin.vars.scope : [':root'];
      const sel = scopes.map((sc) => (sc === ':root' || sc === 'html' ? on : `${on} ${forgiving([sc])}`));
      out.push(`${sel.join(',')}{${decl}}`);
    }
    for (const slot of skin.slots || []) {
      const decl = ROLE_CSS[slot.role];
      if (decl && slot.selectors && slot.selectors.length) out.push(`${on} ${forgiving(slot.selectors)}{${decl}}`);
    }
    if (skin.css) out.push(skin.css);
    return out.join('\n');
  }

  let probe = null;
  function rgba(color) {
    if (!probe) {
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      probe = c.getContext('2d', { willReadFrequently: true });
    }
    probe.clearRect(0, 0, 1, 1);
    probe.fillStyle = 'rgba(0,0,0,0)';
    probe.fillStyle = color;
    probe.fillRect(0, 0, 1, 1);
    const d = probe.getImageData(0, 0, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
  }

  const luminance = (c) => (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;

  function query(sel) {
    try {
      return document.querySelector(sel);
    } catch {
      return null;
    }
  }

  function detectScheme() {
    const forced = s.config.options && s.config.options.scheme;
    if (forced === 'light' || forced === 'dark') return forced;
    const sc = s.skin.scheme || {};
    if ((sc.dark || []).some(query)) return 'dark';
    if ((sc.light || []).some(query)) return 'light';
    const el = (sc.probe && query(sc.probe)) || document.body;
    if (el) {
      const text = rgba(getComputedStyle(el).color);
      if (text.a > 0) return luminance(text) > 0.5 ? 'dark' : 'light';
    }
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function palette(scheme) {
    const p = s.theme.palette || {};
    return Object.assign({}, DEFAULT_PALETTE[scheme], p[scheme] || p.light || p.dark || {});
  }

  function mount(config) {
    if (window.top !== window && !(config.options && config.options.frame)) return null;
    if (s && config.key && s.config.key === config.key) return api;
    unmount();
    const skin = config.skin || pickSkin(config.skins, location.href);
    if (!skin || !config.theme) return null;
    s = {
      config,
      skin,
      theme: config.theme,
      scheme: 'light',
      ready: false,
      errors: [],
      frame: null,
      root: null,
      style: null,
      timer: 0,
      observer: null,
      waiter: null,
    };
    whenDocument(attach);
    return api;
  }

  function whenDocument(fn) {
    if (document.documentElement) return fn();
    s.waiter = new MutationObserver(() => {
      if (!document.documentElement) return;
      s.waiter.disconnect();
      fn();
    });
    s.waiter.observe(document, { childList: true });
  }

  function attach() {
    if (!s) return;
    const html = document.documentElement;
    s.style = document.createElement('style');
    s.style.id = STYLE_ID;
    s.root = buildRoot();
    s.scheme = detectScheme();
    s.style.textContent = buildCss(s.skin, palette(s.scheme));
    html.setAttribute('data-diorama-scheme', s.scheme);
    html.classList.add(ON);
    html.append(s.style, s.root);
    addEventListener('message', onMessage);
    s.observer = new MutationObserver(guard);
    s.observer.observe(html, { attributes: true, attributeFilter: ['class'], childList: true });
    s.timer = setInterval(refreshScheme, SCHEME_POLL_MS);
  }

  function buildRoot() {
    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.setAttribute('aria-hidden', 'true');
    root.style.cssText =
      'position:fixed;inset:0;z-index:-2147483647;pointer-events:none;overflow:hidden;background:var(--diorama-base)';

    const frame = document.createElement('iframe');
    frame.name = FRAME_NAME;
    frame.title = 'Animated background';
    frame.tabIndex = -1;
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;border:0;background:transparent;pointer-events:none;color-scheme:normal';
    const url = s.config.renderer && s.config.renderer.url;
    if (url) frame.src = url;

    const scrim = document.createElement('div');
    scrim.style.cssText = 'position:absolute;inset:0;background:var(--diorama-scrim)';

    root.append(frame, scrim);
    s.frame = frame;
    return root;
  }

  function guard() {
    if (!s || !s.root) return;
    const html = document.documentElement;
    if (!html.classList.contains(ON)) html.classList.add(ON);
    if (!s.style.isConnected) html.append(s.style);
    if (!s.root.isConnected) html.append(s.root);
    refreshScheme();
  }

  function refreshScheme() {
    if (!s || !s.style) return;
    const next = detectScheme();
    if (next === s.scheme) return;
    s.scheme = next;
    document.documentElement.setAttribute('data-diorama-scheme', next);
    s.style.textContent = buildCss(s.skin, palette(next));
    post({ type: 'scheme', scheme: next, palette: palette(next) });
  }

  function unmount() {
    if (!s) return;
    const st = s;
    s = null;
    if (st.waiter) st.waiter.disconnect();
    if (st.observer) st.observer.disconnect();
    clearInterval(st.timer);
    removeEventListener('message', onMessage);
    if (st.root) st.root.remove();
    if (st.style) st.style.remove();
    const html = document.documentElement;
    if (html) {
      html.classList.remove(ON);
      html.removeAttribute('data-diorama-scheme');
    }
  }

  function post(msg) {
    const w = s && s.frame && s.frame.contentWindow;
    if (w) w.postMessage(Object.assign({ diorama: 1 }, msg), '*');
  }

  function configMessage() {
    const t = s.theme;
    const o = s.config.options || {};
    return {
      type: 'config',
      theme: { id: t.id, resolution: t.resolution || 1, options: t.options || {} },
      fps: o.fps || t.fps || 30,
      paused: !!o.paused,
      scheme: s.scheme,
      palette: palette(s.scheme),
    };
  }

  function onMessage(e) {
    if (!s || !s.frame || e.source !== s.frame.contentWindow) return;
    const m = e.data;
    if (!m || m.diorama !== 1) return;
    if (m.type === 'hello') {
      s.ready = false;
      post(configMessage());
    } else if (m.type === 'ready') {
      s.ready = true;
    } else if (m.type === 'error') {
      s.errors.push(String(m.message).slice(0, 400));
      if (s.errors.length > 10) s.errors.shift();
    }
  }

  function setPaused(paused) {
    if (!s) return;
    s.config.options = Object.assign({}, s.config.options, { paused });
    post({ type: paused ? 'pause' : 'resume' });
  }

  function matches(selectors) {
    const found = new Set();
    for (const sel of selectors || []) {
      try {
        document.querySelectorAll(sel).forEach((el) => found.add(el));
      } catch {
      }
    }
    return found.size;
  }

  function report() {
    const base = { version: VERSION, url: location.href, mounted: !!s };
    if (!s) return base;
    const slots = (s.skin.slots || []).map((sl) => ({
      name: sl.name,
      role: sl.role,
      required: !!sl.required,
      matches: matches(sl.selectors),
    }));
    const scope = (s.skin.vars && s.skin.vars.scope) || [':root'];
    return Object.assign(base, {
      theme: s.theme.id,
      skin: s.skin.id,
      scheme: s.scheme,
      renderer: s.ready ? 'running' : 'starting',
      errors: s.errors.slice(),
      slots,
      vars: s.skin.vars ? { scope, matches: matches(scope.map((x) => (x === ':root' ? 'html' : x))) } : null,
      missing: slots.filter((sl) => sl.required && !sl.matches).map((sl) => sl.name),
    });
  }

  function opaqueLayer(el) {
    for (const pseudo of ['', '::before', '::after']) {
      const cs = getComputedStyle(el, pseudo || null);
      if (pseudo && (cs.content === 'none' || cs.content === 'normal')) continue;
      if (pseudo && !(parseFloat(cs.width) >= 4 && parseFloat(cs.height) >= 4)) continue;
      if (cs.backgroundImage !== 'none') return { pseudo, background: cs.backgroundImage.slice(0, 80) };
      if (rgba(cs.backgroundColor).a >= 0.85) return { pseudo, background: cs.backgroundColor };
    }
    return null;
  }

  function inspect(opts) {
    const cols = (opts && opts.cols) || 16;
    const rows = (opts && opts.rows) || 10;
    const hits = new Map();
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const x = ((i + 0.5) * innerWidth) / cols;
        const y = ((j + 0.5) * innerHeight) / rows;
        for (const el of document.elementsFromPoint(x, y)) {
          if (el === document.documentElement) break;
          const found = opaqueLayer(el);
          if (!found) continue;
          if (!hits.has(el)) hits.set(el, {});
          const byPseudo = hits.get(el);
          const hit = byPseudo[found.pseudo] || (byPseudo[found.pseudo] = { el, pseudo: found.pseudo, points: 0, background: found.background });
          hit.points++;
          break;
        }
      }
    }
    const total = cols * rows;
    return [...hits.values()]
      .flatMap((byPseudo) => Object.values(byPseudo))
      .sort((a, b) => b.points - a.points)
      .map((h) => {
        const r = h.el.getBoundingClientRect();
        return {
          selector: describe(h.el) + h.pseudo,
          coverage: Math.round((h.points / total) * 100),
          background: h.background,
          size: `${Math.round(r.width)}x${Math.round(r.height)}`,
        };
      });
  }

  function describe(el) {
    const parts = [];
    for (let e = el, depth = 0; e && e !== document.documentElement && depth < 4; e = e.parentElement, depth++) {
      const tag = e.tagName.toLowerCase();
      if (e.id && /^[A-Za-z][\w-]*$/.test(e.id)) {
        parts.unshift(`${tag}#${e.id}`);
        break;
      }
      const testId = e.getAttribute('data-testid');
      if (testId) {
        parts.unshift(`${tag}[data-testid="${testId}"]`);
        break;
      }
      const classes = [...e.classList].filter((c) => /^[A-Za-z][\w-]*$/.test(c)).slice(0, 4);
      const role = e.getAttribute('role');
      parts.unshift(tag + (classes.length ? '.' + classes.join('.') : role ? `[role="${role}"]` : ''));
      if (classes.length) break;
    }
    return parts.join(' > ');
  }

  const api = {
    version: VERSION,
    mount,
    unmount,
    report,
    inspect,
    pause: () => setPaused(true),
    resume: () => setPaused(false),
    pickSkin,
    buildCss,
  };
  globalThis.DIORAMA = api;
})();
