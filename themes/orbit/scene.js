(() => {
  const { grid: createGrid, rng, fbm, css, mix, TAU } = diorama;

  const SKY = {
    dark: {
      top: '#05070f',
      bottom: '#0d1330',
      stars: ['#ffffff', '#cfe0ff', '#ffe7c2', '#a9c8ff'],
      nebula: ['#7b5cff', '#2fc6d6'],
      planet: ['#f6c27a', '#d98a52', '#8a4b3a'],
      ring: '#e9d3a8',
      moon: '#d8dce8',
      meteor: '#ffffff',
    },
    light: {
      top: '#f3f1ec',
      bottom: '#dfe6f1',
      stars: ['#1d2a4d', '#33467a', '#5a4a7a', '#2a3b66'],
      nebula: ['#8d7ad8', '#4fb2c2'],
      planet: ['#e0894a', '#c0603a', '#6e3a30'],
      ring: '#7a5a3a',
      moon: '#5d6683',
      meteor: '#1d2a4d',
    },
  };

  let g = null;
  let scheme = 'dark';
  let opts = {};
  let stars = [];
  let nebula = null;
  let meteor = null;

  function buildGrid(env) {
    const mark = opts.mark || 'braille';
    g = createGrid({ mark, cell: opts.cell || (mark === 'braille' ? 11 : 12), glyphs: '.:*+o', flicker: 0.8, size: 1.1, shade: scheme === 'dark' ? 'light' : 'dark' }).resize(env);
  }

  function buildSky() {
    const rand = rng(opts.seed || 11);
    const cols = g.cols;
    const rows = g.rows;
    const count = Math.round(cols * rows * (opts.density ?? 0.05));
    stars = [];
    for (let i = 0; i < count; i++) {
      const depth = rand();
      stars.push({
        x: rand() * cols,
        y: rand() * rows,
        depth,
        size: depth > 0.92 ? 0.9 : depth > 0.6 ? 0.55 : 0.4,
        tone: Math.floor(rand() * 4),
        rate: 0.5 + rand() * 2,
        phase: rand() * TAU,
      });
    }
    const w = Math.ceil(cols / 2);
    const h = Math.ceil(rows / 2);
    nebula = document.createElement('canvas');
    nebula.width = w * 2;
    nebula.height = h;
    const nc = nebula.getContext('2d');
    const img = nc.createImageData(w * 2, h);
    const [ca, cb] = SKY[scheme].nebula.map(diorama.rgb);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w * 2; x++) {
        const u = (x % w) / w;
        const n = fbm(Math.cos(u * TAU) * 1.4 + 3, Math.sin(u * TAU) * 1.4 + y * 0.09, 1.5, 4);
        const m = fbm(x * 0.03 + 9, y * 0.05, 4.2, 3);
        const a = Math.max(0, n - 0.48) * 2.6;
        const c = mix(ca, cb, m);
        const i = (y * w * 2 + x) * 4;
        img.data[i] = c[0];
        img.data[i + 1] = c[1];
        img.data[i + 2] = c[2];
        img.data[i + 3] = Math.min(255, a * 255 * (scheme === 'dark' ? 0.4 : 0.3));
      }
    }
    nc.putImageData(img, 0, 0);
  }

  function drawPlanet(c, t) {
    const p = SKY[scheme];
    const cols = g.cols;
    const rows = g.rows;
    const R = Math.min(rows * 0.19, cols * 0.11);
    const px = cols * 0.83;
    const py = rows * 0.27;
    const tilt = -0.32;
    const ringA = R * 2.05;
    const ringB = R * 0.42;

    const ring = (front) => {
      c.save();
      c.translate(px, py);
      c.rotate(tilt);
      c.beginPath();
      c.rect(-ringA - 2, front ? 0 : -ringB - 2, ringA * 2 + 4, ringB + 2);
      c.clip();
      for (const [k, a] of [[1, 0.9], [0.86, 0.55], [0.74, 0.35]]) {
        c.strokeStyle = css(p.ring, a);
        c.lineWidth = R * 0.07;
        c.beginPath();
        c.ellipse(0, 0, ringA * k, ringB * k, 0, 0, TAU);
        c.stroke();
      }
      c.restore();
    };

    ring(false);

    c.save();
    c.beginPath();
    c.arc(px, py, R, 0, TAU);
    c.clip();
    const body = c.createRadialGradient(px - R * 0.45, py - R * 0.5, R * 0.1, px, py, R * 1.05);
    body.addColorStop(0, p.planet[0]);
    body.addColorStop(0.55, p.planet[1]);
    body.addColorStop(1, p.planet[2]);
    c.fillStyle = body;
    c.fillRect(px - R, py - R, R * 2, R * 2);
    c.translate(px, py);
    c.rotate(tilt);
    for (let i = -4; i <= 4; i++) {
      const y = (i / 4.5) * R + Math.sin(t * 0.2 + i) * R * 0.02;
      c.fillStyle = css(i % 2 ? p.planet[2] : p.planet[0], 0.28);
      c.fillRect(-R, y, R * 2, R * (0.08 + 0.05 * Math.sin(i * 1.7)));
    }
    const spot = (t * 0.03) % 1;
    c.fillStyle = css(p.planet[2], 0.5);
    c.beginPath();
    c.ellipse(-R + spot * R * 2.4, R * 0.28, R * 0.16, R * 0.08, 0, 0, TAU);
    c.fill();
    c.restore();

    c.save();
    c.beginPath();
    c.arc(px, py, R, 0, TAU);
    c.clip();
    const shade = c.createRadialGradient(px - R * 0.6, py - R * 0.6, R * 0.6, px - R * 0.3, py - R * 0.3, R * 1.7);
    shade.addColorStop(0, 'rgba(0,0,0,0)');
    shade.addColorStop(1, scheme === 'dark' ? 'rgba(5,7,15,0.85)' : 'rgba(240,238,232,0.7)');
    c.globalCompositeOperation = scheme === 'dark' ? 'destination-out' : 'source-over';
    c.fillStyle = shade;
    c.fillRect(px - R, py - R, R * 2, R * 2);
    c.restore();

    ring(true);

    const orbit = t * 0.12;
    const mx = px + Math.cos(orbit) * ringA * 1.25;
    const my = py + Math.sin(orbit) * ringB * 1.6 + Math.cos(orbit) * ringA * 1.25 * Math.sin(tilt);
    const behind = Math.sin(orbit) < 0 && Math.hypot(mx - px, my - py) < R;
    if (!behind) {
      c.fillStyle = p.moon;
      c.beginPath();
      c.arc(mx, my, R * 0.16, 0, TAU);
      c.fill();
    }
  }

  function drawMeteor(c, t) {
    if (!meteor || t > meteor.end) {
      const rand = Math.random;
      if (!meteor || t > meteor.end + meteor.gap) {
        meteor = {
          start: t,
          end: t + 1.1,
          gap: 4 + rand() * 6,
          x: g.cols * (0.1 + rand() * 0.6),
          y: g.rows * (0.05 + rand() * 0.3),
          dx: 22 + rand() * 10,
          dy: 9 + rand() * 6,
        };
      }
      if (t > meteor.end) return;
    }
    const k = (t - meteor.start) / (meteor.end - meteor.start);
    const hx = meteor.x + meteor.dx * k;
    const hy = meteor.y + meteor.dy * k;
    const tail = c.createLinearGradient(hx, hy, hx - meteor.dx * 0.35, hy - meteor.dy * 0.35);
    tail.addColorStop(0, css(SKY[scheme].meteor, 1 - k * 0.6));
    tail.addColorStop(1, css(SKY[scheme].meteor, 0));
    c.strokeStyle = tail;
    c.lineWidth = 0.6;
    c.beginPath();
    c.moveTo(hx, hy);
    c.lineTo(hx - meteor.dx * 0.35, hy - meteor.dy * 0.35);
    c.stroke();
  }

  diorama.scene({
    setup(env) {
      opts = env.options || {};
      scheme = env.scheme;
      buildGrid(env);
      buildSky();
    },
    resize(env) {
      buildGrid(env);
      buildSky();
    },
    scheme(env) {
      scheme = env.scheme;
      buildGrid(env);
      buildSky();
    },
    frame({ t }, env) {
      const ctx = env.canvas.getContext('2d');
      const p = SKY[scheme];
      const bg = ctx.createLinearGradient(0, 0, 0, env.canvas.height);
      bg.addColorStop(0, p.top);
      bg.addColorStop(1, p.bottom);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, env.canvas.width, env.canvas.height);

      const c = g.begin();
      const speed = opts.speed ?? 1;
      const shift = (t * 0.25 * speed) % nebula.width;
      c.drawImage(nebula, -shift, 0, nebula.width, g.rows);
      c.drawImage(nebula, nebula.width - shift, 0, nebula.width, g.rows);

      for (const s of stars) {
        const x = (s.x - t * speed * (0.15 + s.depth * 0.6)) % g.cols;
        const tw = 0.55 + 0.45 * Math.sin(t * s.rate + s.phase);
        c.fillStyle = css(p.stars[s.tone], Math.min(1, tw * (0.35 + s.depth)));
        c.fillRect(x < 0 ? x + g.cols : x, s.y, s.size, s.size);
      }

      drawPlanet(c, t);
      drawMeteor(c, t);
      g.draw(ctx, t);
    },
  });
})();
