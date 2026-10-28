(() => {
  const { grid: createGrid, rng, noise, hash, css, TAU } = diorama;

  const POND = {
    light: {
      bg: ['#eef3ee', '#dbe8e2'],
      water: [58, 132, 124],
      depth: 0.14,
      pads: ['#4f9a5b', '#69ad62', '#3f8550'],
      flower: '#f39bc0',
      koi: [
        ['#f4f1ea', '#ff5a24'],
        ['#ff7f22', '#ffc277'],
        ['#f4f1ea', '#1d1d1f'],
        ['#ffb02e', '#fff1cf'],
      ],
    },
    dark: {
      bg: ['#06110e', '#0b1d18'],
      water: [74, 196, 176],
      depth: 0.12,
      pads: ['#2f8f55', '#45a865', '#22744a'],
      flower: '#ff8fbf',
      koi: [
        ['#fff6ea', '#ff6a30'],
        ['#ff8a2e', '#ffd08a'],
        ['#fff6ea', '#3a3a44'],
        ['#ffc13d', '#fff1cf'],
      ],
    },
  };

  let g = null;
  let scheme = 'light';
  let opts = {};
  let fish = [];
  let pads = [];
  let ripples = [];
  let water = null;
  let nextRipple = 0;

  function buildGrid(env) {
    const mark = opts.mark || 'halftone';
    g = createGrid({ mark, cell: opts.cell || (mark === 'braille' ? 9 : 12), glyphs: '.:o*O@', flicker: 0.3, size: 1, shade: scheme === 'dark' ? 'light' : 'dark' }).resize(env);
    water = g.ctx.createImageData(g.cols * g.sx, g.rows * g.sy);
  }

  function buildPond() {
    const rand = rng(opts.seed || 21);
    const cols = g.cols;
    const rows = g.rows;
    fish = [];
    for (let i = 0; i < (opts.koi ?? 5); i++) {
      const len = 11 + rand() * 6;
      const x = cols * (0.2 + rand() * 0.6);
      const y = rows * (0.2 + rand() * 0.6);
      const heading = rand() * TAU;
      const spine = [];
      for (let k = 0; k < 14; k++) spine.push({ x: x - Math.cos(heading) * k * (len / 13), y: y - Math.sin(heading) * k * (len / 13) });
      fish.push({ spine, len, heading, speed: 2.2 + rand() * 1.6, seed: rand() * 100, look: i % 4, phase: rand() * TAU });
    }
    pads = [];
    for (let i = 0; i < (opts.pads ?? 6); i++) {
      pads.push({ x: rand() * cols, y: rand() * rows, r: 2.6 + rand() * 2.4, angle: rand() * TAU, spin: (rand() - 0.5) * 0.05, drift: 0.15 + rand() * 0.2, tone: i % 3, flower: rand() < 0.35 });
    }
    ripples = [];
  }

  function steer(f, dt, t) {
    const head = f.spine[0];
    const cols = g.cols;
    const rows = g.rows;
    const margin = 6;
    let turn = (noise(f.seed, t * 0.15) - 0.5) * 2.2;
    const toCenter = Math.atan2(rows / 2 - head.y, cols / 2 - head.x);
    if (head.x < margin || head.x > cols - margin || head.y < margin || head.y > rows - margin) {
      let diff = toCenter - f.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      turn += diff * 2.5;
    }
    f.heading += turn * dt;
    const speed = f.speed * (opts.speed ?? 1);
    head.x += Math.cos(f.heading) * speed * dt;
    head.y += Math.sin(f.heading) * speed * dt;
    const gap = f.len / 13;
    for (let k = 1; k < f.spine.length; k++) {
      const a = f.spine[k - 1];
      const b = f.spine[k];
      const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      b.x = a.x + ((b.x - a.x) / d) * gap;
      b.y = a.y + ((b.y - a.y) / d) * gap;
    }
  }

  function paintWater(t) {
    const p = POND[scheme];
    const W = g.cols * g.sx;
    const H = g.rows * g.sy;
    const data = water.data;
    for (let y = 0; y < H; y++) {
      const cy = y / g.sy;
      for (let x = 0; x < W; x++) {
        const cx = x / g.sx;
        let v = 0.5 + 0.25 * Math.sin(cx * 0.32 + t * 0.55 + Math.sin(cy * 0.21 + t * 0.35) * 1.4) + 0.25 * Math.sin(cy * 0.27 - t * 0.45 + Math.cos(cx * 0.17) * 1.2);
        for (const r of ripples) {
          const age = t - r.born;
          const d = Math.abs(Math.hypot(cx - r.x, cy - r.y) - age * 5);
          if (d < 1.6) v += (1 - d / 1.6) * (1 - age / r.life) * 0.9;
        }
        const i = (y * W + x) * 4;
        data[i] = p.water[0];
        data[i + 1] = p.water[1];
        data[i + 2] = p.water[2];
        data[i + 3] = Math.max(0, Math.min(255, (0.012 + v * p.depth) * 255));
      }
    }
    g.ctx.putImageData(water, 0, 0);
  }

  function drawKoi(c, f, t) {
    const [base, patch] = POND[scheme].koi[f.look];
    const n = f.spine.length;
    const tail = f.spine[n - 1];
    const prev = f.spine[n - 3];
    const back = Math.atan2(tail.y - prev.y, tail.x - prev.x);
    const flap = Math.sin(t * 6 + f.phase) * 0.5;
    c.fillStyle = base;
    c.save();
    c.translate(tail.x, tail.y);
    c.rotate(back + flap);
    c.beginPath();
    c.moveTo(-0.3, 0);
    c.lineTo(f.len * 0.22, -f.len * 0.13);
    c.lineTo(f.len * 0.17, 0);
    c.lineTo(f.len * 0.22, f.len * 0.13);
    c.closePath();
    c.fill();
    c.restore();
    for (let k = n - 1; k >= 0; k--) {
      const s = f.spine[k];
      const u = k / (n - 1);
      const r = f.len * 0.11 * Math.pow(Math.sin(Math.PI * (0.18 + u * 0.82)), 0.8) + 0.25;
      c.fillStyle = hash(Math.floor(f.seed), k >> 1, 3) > 0.55 ? patch : base;
      c.beginPath();
      c.arc(s.x, s.y, r, 0, TAU);
      c.fill();
      if (k === 3) {
        const a = Math.atan2(f.spine[2].y - s.y, f.spine[2].x - s.x);
        c.fillStyle = base;
        for (const side of [-1, 1]) {
          c.beginPath();
          c.ellipse(s.x + Math.cos(a + side * 1.9) * r * 1.3, s.y + Math.sin(a + side * 1.9) * r * 1.3, r * 0.9, r * 0.35, a + side * 0.9, 0, TAU);
          c.fill();
        }
      }
    }
  }

  function drawPad(c, pad, t) {
    const p = POND[scheme];
    pad.angle += pad.spin * 0.03;
    pad.x += Math.cos(t * 0.05 + pad.r) * pad.drift * 0.03;
    pad.y += Math.sin(t * 0.04 + pad.r) * pad.drift * 0.03;
    c.fillStyle = p.pads[pad.tone];
    c.beginPath();
    c.moveTo(pad.x, pad.y);
    c.arc(pad.x, pad.y, pad.r, pad.angle + 0.35, pad.angle + TAU - 0.35);
    c.closePath();
    c.fill();
    if (pad.flower) {
      c.fillStyle = p.flower;
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU + t * 0.05;
        c.beginPath();
        c.ellipse(pad.x + Math.cos(a) * 0.7, pad.y + Math.sin(a) * 0.7, 0.75, 0.4, a, 0, TAU);
        c.fill();
      }
    }
  }

  diorama.scene({
    setup(env) {
      opts = env.options || {};
      scheme = env.scheme;
      buildGrid(env);
      buildPond();
    },
    resize(env) {
      buildGrid(env);
      buildPond();
    },
    scheme(env) {
      scheme = env.scheme;
      buildGrid(env);
    },
    frame({ t, dt }, env) {
      const step = Math.min(dt, 0.1);
      const ctx = env.canvas.getContext('2d');
      const p = POND[scheme];
      const bg = ctx.createLinearGradient(0, 0, env.canvas.width, env.canvas.height);
      bg.addColorStop(0, p.bg[0]);
      bg.addColorStop(1, p.bg[1]);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, env.canvas.width, env.canvas.height);

      if (t > nextRipple) {
        const source = Math.random() < 0.5 && pads.length ? pads[Math.floor(Math.random() * pads.length)] : { x: Math.random() * g.cols, y: Math.random() * g.rows };
        ripples.push({ x: source.x, y: source.y, born: t, life: 4 });
        nextRipple = t + 1.5 + Math.random() * 2.5;
      }
      ripples = ripples.filter((r) => t - r.born < r.life);

      g.begin();
      paintWater(t);
      const c = g.ctx;
      for (const f of fish) {
        steer(f, step, t);
        drawKoi(c, f, t);
      }
      for (const pad of pads) drawPad(c, pad, t);
      g.draw(ctx, t);
    },
  });
})();
