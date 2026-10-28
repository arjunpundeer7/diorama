(() => {
  let ctx = null;

  diorama.scene({
    setup(env) {
      ctx = env.canvas.getContext('2d');
    },

    frame({ t }, env) {
      const w = env.canvas.width;
      const h = env.canvas.height;
      const colors = env.options.colors[env.scheme] || env.options.colors.light;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = env.palette.base;
      ctx.fillRect(0, 0, w, h);
      colors.forEach((color, i) => {
        const a = t * (0.07 + i * 0.03) + i * 2.1;
        const x = w * (0.5 + 0.38 * Math.cos(a));
        const y = h * (0.5 + 0.38 * Math.sin(a * 1.3));
        const r = Math.max(w, h) * 0.5;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      });
    },
  });
})();
