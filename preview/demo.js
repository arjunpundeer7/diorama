(async () => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const parseValue = (v) => {
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  };
  const params = new URLSearchParams(location.search);
  const themes = await (await fetch('api/themes.json')).json();
  const marks = ['ascii', 'braille', 'halftone', 'dither', 'mosaic', 'teletext'];

  if (params.has('bare')) document.documentElement.classList.add('bare');
  if (params.has('stage')) document.documentElement.classList.add('stage');

  $('theme').replaceChildren(...themes.map((t) => new Option(t.name, t.id)));
  $('mark').replaceChildren(new Option('Theme default', ''), ...marks.map((m) => new Option(m, m)));

  const pick = (id) => themes.find((t) => t.id === id) || themes[0];
  let theme = pick(params.get('theme'));
  $('theme').value = theme.id;
  $('mark').value = params.get('mark') || '';
  $('scheme').value = params.get('scheme') || theme.scheme || 'light';

  async function apply() {
    theme = pick($('theme').value);
    const query = new URLSearchParams({ theme: theme.id, scheme: $('scheme').value });
    if ($('mark').value) query.set('mark', $('mark').value);
    for (const [k, v] of params) if (k.startsWith('set.')) query.set(k, v);
    const config = await (await fetch(`api/config/${theme.id}.json`)).json();
    if ($('mark').value) config.theme.options.mark = $('mark').value;
    for (const [k, v] of params) if (k.startsWith('set.')) config.theme.options[k.slice(4)] = parseValue(v);
    config.options.scheme = $('scheme').value;
    config.key = query.toString();
    document.documentElement.dataset.scheme = $('scheme').value;
    globalThis.DIORAMA.mount(config);

    const mark = $('mark').value || theme.mark;
    $('title').textContent = `${theme.name} chat theme`;
    $('nav-theme').textContent = `${theme.name} chat theme`;
    $('ask').textContent = `make my chat ${theme.name}`;
    $('card-title').textContent = theme.name;
    $('card-meta').textContent = `Chat theme · ${theme.tagline || mark} · ${theme.fps} fps`;
    $('thumb').src = theme.preview ? `themes/${theme.id}/preview.png` : '';
    if (!params.has('bare')) history.replaceState(null, '', `?${query}`);
  }

  for (const id of ['theme', 'mark', 'scheme']) $(id).addEventListener('change', apply);
  apply();
})();
