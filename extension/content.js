(() => {
  'use strict';

  const { themes, skins } = self.DIORAMA_CATALOG;
  const skin = DIORAMA.pickSkin(skins, location.href);
  if (!skin) return;

  const DEFAULTS = { enabled: true, theme: themes.lagoon ? 'lagoon' : Object.keys(themes)[0], mark: '', disabledSites: [], paused: false, fps: 0 };
  let settings = { ...DEFAULTS };

  function apply() {
    const theme = themes[settings.theme] || themes[DEFAULTS.theme];
    if (!theme || !settings.enabled || settings.disabledSites.includes(location.hostname)) {
      DIORAMA.unmount();
      return;
    }
    DIORAMA.mount({
      key: [theme.id, skin.id, settings.fps, settings.mark].join('|'),
      theme: settings.mark ? { ...theme, options: { ...theme.options, mark: settings.mark } } : theme,
      skin,
      renderer: { url: chrome.runtime.getURL(`renderer.html?theme=${encodeURIComponent(theme.id)}`) },
      options: { fps: settings.fps || undefined, paused: settings.paused },
    });
    if (settings.paused) DIORAMA.pause();
    else DIORAMA.resume();
  }

  chrome.storage.sync.get(DEFAULTS).then((stored) => {
    settings = { ...DEFAULTS, ...stored };
    apply();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    for (const [key, { newValue }] of Object.entries(changes)) {
      settings[key] = newValue === undefined ? DEFAULTS[key] : newValue;
    }
    apply();
  });

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (!msg) return;
    if (msg.type === 'diorama:report') {
      reply({ ...DIORAMA.report(), host: location.hostname, skinName: skin.name, skinStatus: skin.status });
    } else if (msg.type === 'diorama:inspect') {
      reply(DIORAMA.inspect());
    }
  });
})();
