(() => {
  const { grid: createGrid, fbm, noise, rng, mix, css, TAU } = diorama;

  const PALETTE = {
    light: { paper: '#f1ebdd', ink: '#1e1b17', accent: '#ff5a1f' },
    dark: { paper: '#100f0d', ink: '#ebe3d1', accent: '#ffb347' },
  };

  let g = null;
  let scheme = 'light';
  let opts = {};
  let grains = [];
  let birds = [];

  function tone(k) {
    const p = PALETTE[scheme];
    return css(mix(p.paper, p.ink, k));
  }

  function buildGrid(env) {
    const p = PALETTE[scheme];
    const mark = opts.mark || 'dither';
    g = createGrid({ mark, cell: opts.cell || (mark === 'dither' ? 3 : 12), paper: p.paper, ink: p.ink, accent: p.accent, threshold: 0.01, glyphs: ' .:-=+*#%@', flicker: 0 }).resize(env);
  }

  function buildLife() {
    const rand = rng(opts.seed || 5);
    grains = [];
    for (let i = 0; i < 90; i++) grains.push({ x: rand() * g.cols, y: g.rows * (0.75 + rand() * 0.25), speed: 14 + rand() * 18, phase: rand() * TAU });
    birds = [];
    for (let i = 0; i < (opts.birds ?? 3); i++) birds.push({ x: rand() * g.cols, y: g.rows * (0.12 + rand() * 0.2), speed: 2 + rand() * 1.5, phase: rand() * TAU, size: 1.6 + rand() * 1.2 });
  }

  function ridge(x, layer, t) {
    const n = fbm((x + t * layer.speed) * layer.freq, layer.seed, 0.5, 2);
    const v = Math.min(1, Math.max(0, (n - 0.5) * 2.6 + 0.5));
    const crest = 1 - Math.pow(Math.abs(v * 2 - 1), 0.75);
    return layer.base - layer.amp * crest;
  }

  diorama.scene({
    setup(env) {
      opts = env.options || {};
      scheme = env.scheme;
      buildGrid(env);
      buildLife();
    },
    resize(env) {
      buildGrid(env);
      buildLife();
    },
    scheme(env) {
      scheme = env.scheme;
      buildGrid(env);
    },
    frame({ t, dt }, env) {
      const ctx = env.canvas.getContext('2d');
      const p = PALETTE[scheme];
      ctx.fillStyle = p.paper;
      ctx.fillRect(0, 0, env.canvas.width, env.canvas.height);

      const c = g.begin();
      const cols = g.cols;
      const rows = g.rows;
      const speed = opts.speed ?? 1;
      const sky = c.createLinearGradient(0, 0, 0, rows * 0.7);
      sky.addColorStop(0, tone(0));
      sky.addColorStop(1, tone(0.04));
      c.fillStyle = sky;
      c.fillRect(0, 0, cols, rows);

      const sunX = cols * 0.7;
      const sunY = rows * (0.3 + Math.sin(t * 0.05) * 0.04);
      const sunR = rows * 0.11;
      const halo = c.createRadialGradient(sunX, sunY, sunR * 0.9, sunX, sunY, sunR * 2.4);
      halo.addColorStop(0, css(p.accent, 0.55));
      halo.addColorStop(1, css(p.accent, 0));
      c.fillStyle = halo;
      c.fillRect(sunX - sunR * 2.5, sunY - sunR * 2.5, sunR * 5, sunR * 5);
      c.fillStyle = p.accent;
      c.beginPath();
      c.arc(sunX, sunY, sunR, 0, TAU);
      c.fill();
      c.fillStyle = tone(0.08);
      for (let i = 0; i < 3; i++) c.fillRect(sunX - sunR * 1.2, sunY + sunR * (0.25 + i * 0.22), sunR * 2.4, sunR * 0.06);

      c.strokeStyle = tone(0.9);
      c.lineWidth = 0.8;
      for (const b of birds) {
        b.x -= b.speed * speed * Math.min(dt, 0.1);
        if (b.x < -4) b.x = cols + 4;
        const flap = Math.sin(t * 6 + b.phase) * b.size * 0.5;
        c.beginPath();
        c.moveTo(b.x - b.size, b.y - flap);
        c.lineTo(b.x, b.y);
        c.lineTo(b.x + b.size, b.y - flap);
        c.stroke();
      }

      const layers = [0, 1, 2, 3].map((i) => ({
        base: rows * (0.6 + i * 0.11),
        amp: rows * (0.08 + i * 0.045),
        freq: 0.0075 / (1 + i * 0.35),
        speed: (1.2 + i * 3.2) * speed,
        seed: 3 + i * 7.1,
        k: 0.12 + i * 0.16,
      }));
      for (const layer of layers) {
        const ys = new Float32Array(cols + 3);
        const lee = new Float32Array(cols + 3);
        for (let x = -1; x <= cols + 1; x++) ys[x + 1] = ridge(x, layer, t);
        for (let x = 0; x <= cols; x++) lee[x + 1] = Math.max(-1, Math.min(1, (ys[x + 2] - ys[x]) * 1.2));
        const fill = c.createLinearGradient(0, layer.base - layer.amp, 0, rows);
        fill.addColorStop(0, tone(layer.k));
        fill.addColorStop(1, tone(Math.min(1, layer.k + 0.14)));
        c.fillStyle = fill;
        c.beginPath();
        c.moveTo(-1, rows + 1);
        for (let x = -1; x <= cols + 1; x++) c.lineTo(x, ys[x + 1]);
        c.lineTo(cols + 1, rows + 1);
        c.closePath();
        c.fill();
        for (const [color, sign, alpha, depth] of [[p.ink, 1, 0.2, 1], [p.ink, 1, 0.16, 0.5], [p.paper, -1, 0.35, 0.7]]) {
          c.fillStyle = css(color, alpha);
          c.beginPath();
          c.moveTo(0, ys[1]);
          for (let x = 0; x <= cols; x++) c.lineTo(x, ys[x + 1]);
          for (let x = cols; x >= 0; x--) c.lineTo(x, ys[x + 1] + layer.amp * depth * Math.max(0, lee[x + 1] * sign));
          c.closePath();
          c.fill();
        }
        c.strokeStyle = tone(Math.min(1, layer.k + 0.4));
        c.lineWidth = 0.6;
        c.beginPath();
        for (let x = -1; x <= cols + 1; x++) c.lineTo(x, ys[x + 1] + 0.3);
        c.stroke();
      }

      c.fillStyle = tone(0.85);
      for (const s of grains) {
        s.x -= s.speed * speed * Math.min(dt, 0.1);
        if (s.x < -2) {
          s.x = cols + Math.random() * 10;
          s.y = rows * (0.75 + Math.random() * 0.25);
        }
        c.fillRect(s.x, s.y + Math.sin(t * 3 + s.phase) * 0.6, 1.4, 0.5);
      }

      g.draw(ctx, t);
    },
  });
})();
