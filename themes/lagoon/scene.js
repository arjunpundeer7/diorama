(() => {
  const { grid: createGrid, rng, hash, noise, fbm, css, TAU } = diorama;

  const WATER = {
    light: { top: '#d6f6f5', mid: '#97e0ea', deep: '#4bb5d2', dot: 'rgba(255,255,255,0.5)', shaft: 'rgba(255,255,255,0.16)', spark: '#ffffff' },
    dark: { top: '#06242c', mid: '#0a3945', deep: '#0c4d5d', dot: 'rgba(150,255,235,0.13)', shaft: 'rgba(120,255,230,0.05)', spark: '#9ffff0' },
  };
  const SHELLS = {
    light: [
      { shell: '#8c7633', plate: '#b89d55', skin: '#cdbd82' },
      { shell: '#7a6a30', plate: '#a8914c', skin: '#c4b478' },
      { shell: '#94703a', plate: '#c0985c', skin: '#d4bf88' },
    ],
    dark: [
      { shell: '#5f5a2c', plate: '#857b3d', skin: '#9a9461' },
      { shell: '#54502a', plate: '#78703a', skin: '#8f895a' },
      { shell: '#665330', plate: '#8a7142', skin: '#a08f64' },
    ],
  };
  const CORAL = { light: ['#e2405f', '#ef6b84', '#f797a8', '#c42f50', '#ff8a7a'], dark: ['#ff4f7b', '#ff7aa0', '#d63a6a', '#ff9db6', '#ff6f61'] };
  const FISH = { light: ['#f39a2f', '#f6c63f', '#ff7a3a'], dark: ['#ffb347', '#ffd65c', '#ff8a4c'] };
  const GRASS = { light: ['#3e9a63', '#58b072', '#2f7f52'], dark: ['#2fbf8a', '#3fd69a', '#24a074'] };
  const GLYPHS = { turtle: 'tS%$X', coral: '%$S#&', fish: 'o=~', bubble: 'o', grass: '|)(', other: 'tS%$' };

  let g = null;
  let scheme = 'light';
  let opts = {};
  let world = null;
  let dotPattern = null;

  function family(r, gr, b) {
    const hi = Math.max(r, gr, b);
    const sat = hi ? (hi - Math.min(r, gr, b)) / hi : 0;
    if (sat < 0.2) return GLYPHS.bubble;
    if (gr > r && gr > b) return GLYPHS.grass;
    if (r > gr * 1.3 && b > gr * 0.75) return GLYPHS.coral;
    if (r > gr && gr > b * 1.6 && sat > 0.6 && hi > 200) return GLYPHS.fish;
    return GLYPHS.turtle;
  }

  function glyph(r, gr, b, a, col, row, t) {
    const set = family(r, gr, b);
    const step = Math.floor(t * 0.45 + hash(col, row, 9) * 50);
    return set[Math.floor(hash(col, row, step) * set.length)];
  }

  function buildGrid(env) {
    const mark = opts.mark || 'ascii';
    g = createGrid({
      mark,
      cell: opts.cell || (mark === 'braille' ? 10 : 14),
      glyph,
      shade: scheme === 'dark' ? 'light' : 'dark',
      shadeAlpha: scheme === 'dark' ? 0.4 : 0.5,
      gap: 1,
      paper: WATER[scheme].top,
      ink: '#0b3b4a',
    }).resize(env);
    const cs = g.cell;
    const tile = document.createElement('canvas');
    tile.width = tile.height = cs;
    const tc = tile.getContext('2d');
    tc.fillStyle = WATER[scheme].dot;
    tc.beginPath();
    tc.arc(cs / 2, cs / 2, Math.max(0.8, env.dpr * 0.9), 0, TAU);
    tc.fill();
    dotPattern = env.canvas.getContext('2d').createPattern(tile, 'repeat');
  }

  function buildWorld() {
    const rand = rng(opts.seed || 7);
    const cols = g.cols;
    const rows = g.rows;
    const turtles = [];
    const count = opts.turtles ?? 3;
    for (let i = 0; i < count; i++) {
      const left = rand() < 0.5;
      turtles.push({
        x: cols * (0.28 + ((i + rand() * 0.6) / count) * 0.66),
        y: rows * ([0.3, 0.68, 0.45][i % 3] + (rand() - 0.5) * 0.1),
        size: i === count - 1 && count > 2 ? 10 : 15 + rand() * 4,
        base: (left ? Math.PI : 0) + (rand() - 0.5) * 0.7,
        heading: 0,
        speed: 0.9 + rand() * 0.8,
        stroke: 1.6 + rand() * 0.6,
        phase: rand() * TAU,
        seed: rand() * 100,
        look: Math.floor(rand() * 3),
      });
    }

    const coral = [];
    const clusters = [
      { x: cols * 0.97, y: rows * 0.08, r: Math.max(6, rows * 0.19), s: 1 },
      { x: cols * 0.02, y: rows * 0.58, r: Math.max(5, rows * 0.14), s: 2 },
      { x: cols * 0.62, y: rows * 1.04, r: Math.max(5, rows * 0.17), s: 3 },
      { x: cols * 0.18, y: rows * 1.05, r: Math.max(4, rows * 0.1), s: 4 },
    ];
    for (const c of clusters) {
      for (let y = Math.floor(c.y - c.r); y <= c.y + c.r; y++) {
        for (let x = Math.floor(c.x - c.r); x <= c.x + c.r; x++) {
          const d = Math.hypot((x - c.x) / c.r, (y - c.y) / (c.r * 1.25));
          if (d > 1) continue;
          const n = fbm(x * 0.22 + c.s * 31, y * 0.22, c.s, 3);
          if (n < 0.34 + d * 0.3) continue;
          coral.push({ x, y, tone: Math.floor(hash(x, y, c.s) * 5), phase: hash(y, x, 5) * TAU });
        }
      }
    }

    const fish = [];
    for (let i = 0; i < (opts.fish ?? 12); i++) {
      fish.push({ ox: (rand() - 0.5) * 12, oy: (rand() - 0.5) * 7, seed: rand() * 50, tone: Math.floor(rand() * 3) });
    }

    const bubbles = [];
    for (let i = 0; i < (opts.bubbles ?? 14); i++) {
      bubbles.push({ x: rand() * cols, y: rand() * rows, speed: 1.2 + rand() * 1.6, phase: rand() * TAU, r: 0.3 + rand() * 0.25 });
    }

    const grass = [];
    for (let i = 0; i < 9; i++) {
      grass.push({ x: cols * (0.04 + rand() * 0.3), h: 4 + rand() * rows * 0.16, phase: rand() * TAU, tone: Math.floor(rand() * 3) });
    }

    const sparks = [];
    for (let i = 0; i < Math.round((cols * rows) / 160); i++) {
      sparks.push({ col: Math.floor(rand() * cols), row: Math.floor(rand() * rows), phase: rand() * TAU, rate: 0.3 + rand() * 0.5 });
    }

    world = { turtles, coral, fish, bubbles, grass, sparks, last: 0 };
  }

  function flipper(c, x, y, len, width, angle, side) {
    c.save();
    c.translate(x, y);
    c.rotate(angle);
    c.beginPath();
    c.moveTo(0, -width * 0.7);
    c.quadraticCurveTo(len * 0.45, -width * 1.2 * side, len, width * 0.35 * side);
    c.quadraticCurveTo(len * 0.5, width * 0.9, 0, width * 0.7);
    c.closePath();
    c.fill();
    c.restore();
  }

  function drawTurtle(c, tu, t) {
    const L = tu.size;
    const colors = SHELLS[scheme][tu.look];
    const swim = Math.sin(t * tu.stroke + tu.phase);
    c.save();
    c.translate(tu.x, tu.y);
    c.rotate(tu.heading);
    c.fillStyle = colors.skin;
    flipper(c, L * 0.16, -L * 0.24, L * 0.58, L * 0.17, -2.0 + swim * 0.45, 1);
    flipper(c, L * 0.16, L * 0.24, L * 0.58, L * 0.17, 2.0 - swim * 0.45, -1);
    flipper(c, -L * 0.3, -L * 0.18, L * 0.26, L * 0.12, -2.55 - swim * 0.25, 1);
    flipper(c, -L * 0.3, L * 0.18, L * 0.26, L * 0.12, 2.55 + swim * 0.25, -1);
    c.beginPath();
    c.moveTo(-L * 0.42, -L * 0.05);
    c.lineTo(-L * 0.6, 0);
    c.lineTo(-L * 0.42, L * 0.05);
    c.fill();
    const nod = Math.sin(t * 0.8 + tu.phase) * L * 0.03;
    c.beginPath();
    c.ellipse(L * 0.44, nod * 0.5, L * 0.1, L * 0.08, 0, 0, TAU);
    c.ellipse(L * 0.6, nod, L * 0.14, L * 0.11, 0, 0, TAU);
    c.fill();
    c.fillStyle = colors.shell;
    c.beginPath();
    c.ellipse(0, 0, L * 0.42, L * 0.33, 0, 0, TAU);
    c.fill();
    c.fillStyle = colors.plate;
    c.beginPath();
    c.ellipse(-L * 0.02, 0, L * 0.31, L * 0.23, 0, 0, TAU);
    c.fill();
    c.strokeStyle = colors.shell;
    c.lineWidth = 0.7;
    c.beginPath();
    c.moveTo(-L * 0.3, 0);
    c.lineTo(L * 0.28, 0);
    for (const k of [-0.12, 0.08]) {
      c.moveTo(L * k, -L * 0.22);
      c.lineTo(L * k, L * 0.22);
    }
    c.stroke();
    c.restore();
  }

  function update(dt, t) {
    const { turtles, bubbles } = world;
    const cols = g.cols;
    const rows = g.rows;
    const speed = opts.speed ?? 1;
    for (const tu of turtles) {
      tu.heading = tu.base + Math.sin(t * 0.06 + tu.phase) * 0.35 + (noise(tu.seed, t * 0.04) - 0.5) * 0.9;
      tu.x += Math.cos(tu.heading) * tu.speed * speed * dt;
      tu.y += Math.sin(tu.heading) * tu.speed * speed * dt;
      const m = tu.size;
      if (tu.x > cols + m) tu.x = -m;
      if (tu.x < -m) tu.x = cols + m;
      if (tu.y > rows + m) tu.y = -m;
      if (tu.y < -m) tu.y = rows + m;
    }
    for (const b of bubbles) {
      b.y -= b.speed * speed * dt;
      if (b.y < -2) {
        b.y = rows + 1 + Math.random() * 6;
        b.x = Math.random() * cols;
      }
    }
  }

  function paintWater(ctx, env, t) {
    const w = env.canvas.width;
    const h = env.canvas.height;
    const p = WATER[scheme];
    const grad = ctx.createLinearGradient(0, 0, w * 0.6, h);
    grad.addColorStop(0, p.top);
    grad.addColorStop(0.55, p.mid);
    grad.addColorStop(1, p.deep);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.globalCompositeOperation = scheme === 'dark' ? 'lighter' : 'source-over';
    for (let i = 0; i < 4; i++) {
      const x = w * (0.1 + 0.28 * i + Math.sin(t * 0.05 + i * 1.7) * 0.06);
      const shaft = ctx.createLinearGradient(x, 0, x + w * 0.12, h);
      shaft.addColorStop(0, p.shaft);
      shaft.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = shaft;
      ctx.beginPath();
      ctx.moveTo(x - w * 0.03, 0);
      ctx.lineTo(x + w * 0.05, 0);
      ctx.lineTo(x + w * 0.22, h);
      ctx.lineTo(x + w * 0.08, h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    ctx.fillStyle = dotPattern;
    ctx.fillRect(0, 0, w, h);

    const cs = g.cell;
    const arm = Math.max(2, cs * 0.22);
    const thick = Math.max(1, env.dpr);
    ctx.fillStyle = p.spark;
    for (const s of world.sparks) {
      const a = Math.pow(Math.max(0, Math.sin(t * s.rate + s.phase)), 6);
      if (a < 0.05) continue;
      ctx.globalAlpha = a * 0.8;
      const cx = s.col * cs + cs / 2;
      const cy = s.row * cs + cs / 2;
      ctx.fillRect(cx - arm, cy - thick / 2, arm * 2, thick);
      ctx.fillRect(cx - thick / 2, cy - arm, thick, arm * 2);
    }
    ctx.globalAlpha = 1;
  }

  function paintLife(t) {
    const c = g.begin();
    const { coral, fish, bubbles, grass, turtles } = world;
    const cols = g.cols;
    const rows = g.rows;

    c.lineCap = 'round';
    for (const blade of grass) {
      c.strokeStyle = GRASS[scheme][blade.tone];
      c.lineWidth = 0.9;
      c.beginPath();
      c.moveTo(blade.x, rows + 1);
      for (let k = 1; k <= 6; k++) {
        const f = k / 6;
        c.lineTo(blade.x + Math.sin(t * 0.9 + blade.phase + f * 2) * f * 1.6, rows + 1 - blade.h * f);
      }
      c.stroke();
    }

    const tones = CORAL[scheme];
    for (const p of coral) {
      const pulse = 0.82 + 0.18 * Math.sin(t * 0.6 + p.phase);
      c.globalAlpha = pulse;
      c.fillStyle = tones[p.tone];
      c.fillRect(p.x, p.y, 1, 1);
    }
    c.globalAlpha = 1;

    const sx = cols * (0.5 + 0.34 * Math.sin(t * 0.045));
    const sy = rows * (0.5 + 0.28 * Math.sin(t * 0.063 + 1.3));
    const dir = Math.atan2(Math.cos(t * 0.063 + 1.3) * 0.063 * rows * 0.28, Math.cos(t * 0.045) * 0.045 * cols * 0.34);
    for (const f of fish) {
      const fx = sx + f.ox + (noise(f.seed, t * 0.3) - 0.5) * 4;
      const fy = sy + f.oy + (noise(f.seed + 9, t * 0.3) - 0.5) * 3;
      c.save();
      c.translate(fx, fy);
      c.rotate(dir);
      c.fillStyle = FISH[scheme][f.tone];
      c.beginPath();
      c.ellipse(0, 0, 0.95, 0.5, 0, 0, TAU);
      c.fill();
      c.beginPath();
      c.moveTo(-0.7, 0);
      c.lineTo(-1.5, -0.5 + Math.sin(t * 8 + f.seed) * 0.2);
      c.lineTo(-1.5, 0.5 + Math.sin(t * 8 + f.seed) * 0.2);
      c.closePath();
      c.fill();
      c.restore();
    }

    for (const tu of turtles) drawTurtle(c, tu, t);

    c.fillStyle = scheme === 'dark' ? 'rgba(200,255,250,0.75)' : 'rgba(255,255,255,0.85)';
    for (const b of bubbles) {
      c.beginPath();
      c.arc(b.x + Math.sin(t * 1.7 + b.phase) * 0.6, b.y, b.r + 0.25, 0, TAU);
      c.fill();
    }
  }

  diorama.scene({
    setup(env) {
      opts = env.options || {};
      scheme = env.scheme;
      buildGrid(env);
      buildWorld();
    },
    resize(env) {
      buildGrid(env);
      buildWorld();
    },
    scheme(env) {
      scheme = env.scheme;
      buildGrid(env);
    },
    frame({ t, dt }, env) {
      update(Math.min(dt, 0.1), t);
      const ctx = env.canvas.getContext('2d');
      paintWater(ctx, env, t);
      paintLife(t);
      g.draw(ctx, t);
    },
  });
})();
