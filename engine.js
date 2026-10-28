(() => {
  'use strict';
  const diorama = globalThis.diorama || (globalThis.diorama = {});
  if (diorama.grid) return;

  const TAU = Math.PI * 2;
  const SUB = { ascii: [1, 1], halftone: [1, 1], mosaic: [1, 1], dither: [1, 1], braille: [2, 4], teletext: [2, 3] };
  const BRAILLE_ORDER = [0, 4, 2, 6, 3, 7, 1, 5].map((v) => (v + 0.5) / 8);
  const BRAILLE_SPOTS = [
    [0.36, 0.16], [0.64, 0.16],
    [0.36, 0.39], [0.64, 0.39],
    [0.36, 0.61], [0.64, 0.61],
    [0.36, 0.84], [0.64, 0.84],
  ];
  const TELETEXT = [
    [0, 0, 0], [255, 40, 40], [40, 220, 60], [255, 230, 40],
    [40, 80, 255], [240, 60, 240], [40, 230, 240], [255, 255, 255],
  ];
  const BAYER8 = (() => {
    const m = [
      0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26,
      12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
      3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25,
      15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
    ];
    return m.map((v) => (v + 0.5) / 64);
  })();

  const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);

  function hash(a, b = 0, c = 0) {
    let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1440662683);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  function noise(x, y, z = 0) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const u = smooth(x - xi);
    const v = smooth(y - yi);
    const w = smooth(z - zi);
    const c = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz);
    const x00 = lerp(c(0, 0, 0), c(1, 0, 0), u);
    const x10 = lerp(c(0, 1, 0), c(1, 1, 0), u);
    const x01 = lerp(c(0, 0, 1), c(1, 0, 1), u);
    const x11 = lerp(c(0, 1, 1), c(1, 1, 1), u);
    return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
  }

  function fbm(x, y, z = 0, octaves = 4) {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * noise(x * freq, y * freq, z * freq + i * 17.3);
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  }

  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function rgb(color) {
    if (Array.isArray(color)) return color;
    const hex = String(color).replace('#', '');
    const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex.slice(0, 6);
    const n = parseInt(full, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  const mix = (a, b, t) => {
    const x = rgb(a);
    const y = rgb(b);
    return [lerp(x[0], y[0], t), lerp(x[1], y[1], t), lerp(x[2], y[2], t)];
  };

  const css = (color, alpha = 1) => {
    const c = rgb(color);
    return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${alpha})`;
  };

  const luma = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

  function grid(input) {
    const o = Object.assign(
      {
        mark: 'ascii',
        cell: 14,
        glyphs: '.:-=+*#%@',
        glyph: null,
        font: 'ui-monospace, "Cascadia Mono", "SF Mono", Menlo, Consolas, monospace',
        weight: 700,
        shade: 'dark',
        shadeAlpha: 0.5,
        gap: 1,
        threshold: 0.06,
        flicker: 0.4,
        size: 1,
        paper: '#f1ede2',
        ink: '#1b1a17',
        accent: null,
      },
      input,
    );
    if (!SUB[o.mark]) o.mark = 'ascii';

    const source = document.createElement('canvas');
    const sctx = source.getContext('2d', { willReadFrequently: true });
    const styles = new Map();
    const slots = new Map();
    let atlas = null;
    let atlasCtx = null;
    let flat = null;
    let flatCtx = null;
    let flatImage = null;

    const g = { options: o, cols: 0, rows: 0, cell: 0, dpr: 1, sx: 1, sy: 1, ctx: sctx };

    g.resize = (env) => {
      [g.sx, g.sy] = SUB[o.mark];
      g.dpr = env.dpr;
      g.cell = Math.max(3, Math.round(o.cell * env.dpr));
      g.cols = Math.ceil(env.canvas.width / g.cell);
      g.rows = Math.ceil(env.canvas.height / g.cell);
      source.width = g.cols * g.sx;
      source.height = g.rows * g.sy;
      atlas = null;
      slots.clear();
      if (o.mark === 'dither') {
        flat = flat || document.createElement('canvas');
        flat.width = g.cols;
        flat.height = g.rows;
        flatCtx = flat.getContext('2d');
        flatImage = flatCtx.createImageData(g.cols, g.rows);
      }
      return g;
    };

    g.begin = () => {
      sctx.setTransform(1, 0, 0, 1, 0, 0);
      sctx.clearRect(0, 0, source.width, source.height);
      sctx.setTransform(g.sx, 0, 0, g.sy, 0, 0);
      return sctx;
    };

    g.draw = (ctx, t = 0) => {
      if (!g.cols) return;
      const data = sctx.getImageData(0, 0, source.width, source.height).data;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      MARKS[o.mark](ctx, data, t);
      ctx.restore();
    };

    function style(r, gr, b, a) {
      const key = ((r >> 3) << 15) | ((gr >> 3) << 10) | ((b >> 3) << 5) | Math.round(a * 31);
      let s = styles.get(key);
      if (!s) {
        s = `rgba(${r & 248},${gr & 248},${b & 248},${(Math.round(a * 31) / 31).toFixed(3)})`;
        if (styles.size > 40000) styles.clear();
        styles.set(key, s);
      }
      return s;
    }

    function slot(ch) {
      let i = slots.get(ch);
      if (i !== undefined) return i;
      i = slots.size;
      const cs = g.cell;
      if (!atlas || (i + 1) * cs > atlas.width) {
        const old = atlas;
        atlas = document.createElement('canvas');
        atlas.width = cs * Math.max(32, (i + 1) * 2);
        atlas.height = cs * 2;
        atlasCtx = atlas.getContext('2d');
        if (old) atlasCtx.drawImage(old, 0, 0);
      }
      atlasCtx.font = `${o.weight} ${Math.round(cs * 0.72)}px ${o.font}`;
      atlasCtx.textAlign = 'center';
      atlasCtx.textBaseline = 'middle';
      for (const [row, color] of [[0, '#000'], [1, '#fff']]) {
        atlasCtx.fillStyle = color;
        atlasCtx.fillText(ch, i * cs + cs / 2, row * cs + cs * 0.54);
      }
      slots.set(ch, i);
      return i;
    }

    function pickGlyph(col, row, t) {
      const set = o.glyphs;
      const step = o.flicker ? Math.floor(t * o.flicker + hash(col, row, 3) * 97) : 0;
      return set[Math.floor(hash(col, row, step) * set.length)];
    }

    const MARKS = {
      ascii(ctx, d, t) {
        const cs = g.cell;
        const gap = Math.round(o.gap * g.dpr);
        const inner = cs - gap * 2;
        const shadeRow = o.shade === 'light' ? cs : 0;
        for (let row = 0; row < g.rows; row++) {
          for (let col = 0; col < g.cols; col++) {
            const i = (row * g.cols + col) * 4;
            const a = d[i + 3] / 255;
            if (a < o.threshold) continue;
            const x = col * cs;
            const y = row * cs;
            ctx.globalAlpha = 1;
            ctx.fillStyle = style(d[i], d[i + 1], d[i + 2], a);
            ctx.fillRect(x + gap, y + gap, inner, inner);
            const ch = o.glyph ? o.glyph(d[i], d[i + 1], d[i + 2], a, col, row, t) : pickGlyph(col, row, t);
            if (!ch || ch === ' ') continue;
            const s = slot(ch);
            ctx.globalAlpha = o.shadeAlpha * a;
            ctx.drawImage(atlas, s * cs, shadeRow, cs, cs, x, y, cs, cs);
          }
        }
        ctx.globalAlpha = 1;
      },

      halftone(ctx, d) {
        const cs = g.cell;
        const max = (cs / 2) * 1.08 * o.size;
        for (let row = 0; row < g.rows; row++) {
          const shift = row & 1 ? cs / 2 : 0;
          for (let col = 0; col < g.cols; col++) {
            const i = (row * g.cols + col) * 4;
            const a = d[i + 3] / 255;
            if (a < o.threshold) continue;
            const radius = Math.sqrt(a) * max;
            if (radius < 0.5) continue;
            ctx.fillStyle = style(d[i], d[i + 1], d[i + 2], 1);
            ctx.beginPath();
            ctx.arc(col * cs + cs / 2 + shift, row * cs + cs / 2, radius, 0, TAU);
            ctx.fill();
          }
        }
      },

      braille(ctx, d) {
        const cs = g.cell;
        const w = g.cols * 2;
        const dot = Math.max(1, cs * 0.14 * o.size);
        const round = dot > 1.6;
        for (let row = 0; row < g.rows; row++) {
          for (let col = 0; col < g.cols; col++) {
            let n = 0;
            let rs = 0;
            let gs = 0;
            let bs = 0;
            let bits = 0;
            for (let k = 0; k < 8; k++) {
              const i = ((row * 4 + (k >> 1)) * w + col * 2 + (k & 1)) * 4;
              const a = d[i + 3] / 255;
              if (a <= BRAILLE_ORDER[k] * 0.92 + 0.04) continue;
              bits |= 1 << k;
              rs += d[i];
              gs += d[i + 1];
              bs += d[i + 2];
              n++;
            }
            if (!n) continue;
            ctx.fillStyle = style(rs / n, gs / n, bs / n, 1);
            const x = col * cs;
            const y = row * cs;
            if (round) ctx.beginPath();
            for (let k = 0; k < 8; k++) {
              if (!(bits & (1 << k))) continue;
              const px = x + BRAILLE_SPOTS[k][0] * cs;
              const py = y + BRAILLE_SPOTS[k][1] * cs;
              if (round) {
                ctx.moveTo(px + dot / 2, py);
                ctx.arc(px, py, dot / 2, 0, TAU);
              } else ctx.fillRect(px - dot / 2, py - dot / 2, dot, dot);
            }
            if (round) ctx.fill();
          }
        }
      },

      mosaic(ctx, d) {
        const cs = g.cell;
        const gap = Math.max(1, Math.round(o.gap * 1.5 * g.dpr));
        for (let row = 0; row < g.rows; row++) {
          for (let col = 0; col < g.cols; col++) {
            const i = (row * g.cols + col) * 4;
            const a = d[i + 3] / 255;
            if (a < o.threshold) continue;
            const j = 0.9 + hash(col, row, 11) * 0.2;
            ctx.fillStyle = style(clamp(d[i] * j, 0, 255), clamp(d[i + 1] * j, 0, 255), clamp(d[i + 2] * j, 0, 255), a);
            ctx.fillRect(col * cs + gap, row * cs + gap, cs - gap * 2, cs - gap * 2);
          }
        }
      },

      teletext(ctx, d) {
        const cs = g.cell;
        const w = g.cols * 2;
        const bw = Math.ceil(cs / 2);
        const bh = Math.ceil(cs / 3);
        for (let row = 0; row < g.rows; row++) {
          for (let col = 0; col < g.cols; col++) {
            let n = 0;
            let rs = 0;
            let gs = 0;
            let bs = 0;
            let bits = 0;
            for (let k = 0; k < 6; k++) {
              const i = ((row * 3 + (k >> 1)) * w + col * 2 + (k & 1)) * 4;
              if (d[i + 3] < 128) continue;
              bits |= 1 << k;
              rs += d[i];
              gs += d[i + 1];
              bs += d[i + 2];
              n++;
            }
            if (!n) continue;
            let best = 7;
            let dist = Infinity;
            for (let p = 1; p < TELETEXT.length; p++) {
              const c = TELETEXT[p];
              const e = (c[0] - rs / n) ** 2 + (c[1] - gs / n) ** 2 + (c[2] - bs / n) ** 2;
              if (e < dist) {
                dist = e;
                best = p;
              }
            }
            const c = TELETEXT[best];
            ctx.fillStyle = style(c[0], c[1], c[2], 1);
            for (let k = 0; k < 6; k++) {
              if (bits & (1 << k)) ctx.fillRect(col * cs + (k & 1) * bw, row * cs + (k >> 1) * bh, bw, bh);
            }
          }
        }
      },

      dither(ctx, d) {
        const paper = rgb(o.paper);
        const ink = rgb(o.ink);
        const accent = o.accent ? rgb(o.accent) : null;
        const pl = luma(paper[0], paper[1], paper[2]);
        const span = luma(ink[0], ink[1], ink[2]) - pl || 1;
        const accentSat = accent ? Math.max(0.2, (Math.max(...accent) - Math.min(...accent)) / (Math.max(...accent) || 1)) : 1;
        const out = flatImage.data;
        for (let row = 0; row < g.rows; row++) {
          for (let col = 0; col < g.cols; col++) {
            const i = (row * g.cols + col) * 4;
            const a = d[i + 3] / 255;
            const r = d[i];
            const gr = d[i + 1];
            const b = d[i + 2];
            const hi = Math.max(r, gr, b);
            const sat = hi ? (hi - Math.min(r, gr, b)) / hi : 0;
            const thr = BAYER8[(row & 7) * 8 + (col & 7)];
            if (a < o.threshold) {
              out[i + 3] = 0;
              continue;
            }
            let c = paper;
            if (accent && sat > 0.2) {
              if (clamp(sat / accentSat) * a > thr) c = accent;
            } else {
              const density = clamp(((luma(r, gr, b) - pl) / span) * a);
              if (density > thr) c = ink;
            }
            out[i] = c[0];
            out[i + 1] = c[1];
            out[i + 2] = c[2];
            out[i + 3] = 255;
          }
        }
        flatCtx.putImageData(flatImage, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(flat, 0, 0, g.cols * g.cell, g.rows * g.cell);
      },
    };

    return g;
  }

  Object.assign(diorama, { grid, noise, fbm, hash, rng, rgb, mix, css, luma, clamp, lerp, smooth, TAU, marks: Object.keys(SUB) });
})();
