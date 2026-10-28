(async () => {
  'use strict';

  const themes = await (await fetch('api/themes.json')).json();
  const grid = document.getElementById('grid');

  for (const t of themes) {
    const tile = document.createElement('a');
    tile.className = 'tile';
    tile.href = `./?theme=${encodeURIComponent(t.id)}`;

    const frame = document.createElement('div');
    frame.className = 'frame';
    const iframe = document.createElement('iframe');
    iframe.src = `./?theme=${encodeURIComponent(t.id)}&bare=1`;
    iframe.loading = 'lazy';
    iframe.tabIndex = -1;
    frame.append(iframe);

    const info = document.createElement('div');
    info.className = 'info';
    const name = document.createElement('h2');
    name.textContent = t.name;
    const desc = document.createElement('p');
    desc.textContent = t.description;
    const cmd = document.createElement('code');
    cmd.textContent = `diorama apply ${t.id} cursor`;
    info.append(name, desc, cmd);

    tile.append(frame, info);
    grid.append(tile);
  }

  const fit = () => {
    for (const frame of document.querySelectorAll('.frame')) {
      frame.firstChild.style.transform = `scale(${frame.clientWidth / 1280})`;
    }
  };
  addEventListener('resize', fit);
  fit();
})();
