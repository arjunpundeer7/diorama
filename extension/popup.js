'use strict';

const { themes, skins } = self.DIORAMA_CATALOG;
const DEFAULTS = { enabled: true, theme: themes.lagoon ? 'lagoon' : Object.keys(themes)[0], mark: '', disabledSites: [], paused: false, fps: 0 };
const $ = (id) => document.getElementById(id);

let settings = { ...DEFAULTS };
let host = null;

async function ask(type) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return null;
  try {
    return await chrome.tabs.sendMessage(tab.id, { type });
  } catch {
    return null;
  }
}

const save = (patch) => {
  Object.assign(settings, patch);
  return chrome.storage.sync.set(patch);
};

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function showPreview(id) {
  const t = themes[id];
  $('preview').hidden = !(t && t.preview);
  if (t && t.preview) $('preview').src = `themes/${id}/preview.png`;
  $('description').textContent = (t && t.description) || '';
}

function renderControls() {
  const select = $('theme');
  select.replaceChildren(...Object.values(themes).map((t) => new Option(t.name, t.id)));
  select.value = themes[settings.theme] ? settings.theme : DEFAULTS.theme;
  $('mark').replaceChildren(new Option('Theme default', ''), ...['ascii', 'braille', 'halftone', 'dither', 'mosaic', 'teletext'].map((m) => new Option(m, m)));
  $('mark').value = settings.mark || '';
  showPreview(select.value);
  $('fps').value = String(settings.fps || 0);
  $('enabled').checked = settings.enabled;
  $('paused').checked = settings.paused;
  $('site').checked = !host || !settings.disabledSites.includes(host);
  $('site').disabled = !host;
}

function renderReport(r) {
  const summary = $('summary');
  const list = $('slots');
  list.replaceChildren();
  if (!r) {
    const sites = [...new Set(skins.map((k) => k.name))].join(', ');
    summary.textContent = `No skin for this page. Supported sites: ${sites}.`;
    return;
  }
  host = r.host;
  $('host').textContent = host;
  if (!r.mounted) {
    summary.textContent = `${r.skinName}: theme is off here.`;
    return;
  }
  const status = r.skinStatus === 'verified' ? '' : ` (${r.skinStatus || 'draft'} skin)`;
  summary.textContent = `${r.skinName}${status}, ${r.scheme} mode, renderer ${r.renderer}.`;
  for (const slot of r.slots) {
    const ok = slot.matches > 0;
    const li = el('li', `${slot.name}: ${ok ? slot.matches : 'not found'}`, ok ? 'ok' : slot.required ? 'bad' : 'warn');
    list.append(li);
  }
  for (const err of r.errors || []) list.append(el('li', `theme error: ${err.split('\n')[0]}`, 'bad'));
  $('inspect').hidden = false;
}

async function inspect() {
  const out = $('blockers');
  out.replaceChildren(el('li', 'Sampling…', 'muted'));
  const blockers = await ask('diorama:inspect');
  out.replaceChildren();
  if (!blockers || !blockers.length) {
    out.append(el('li', 'Nothing: the background shows everywhere sampled.', 'ok'));
    return;
  }
  for (const b of blockers.slice(0, 8)) {
    const li = el('li');
    const code = el('code', b.selector);
    code.title = 'Click to copy the selector';
    code.addEventListener('click', () => navigator.clipboard.writeText(b.selector));
    li.append(el('span', `${b.coverage}% `, 'muted'), code);
    out.append(li);
  }
}

async function init() {
  settings = { ...DEFAULTS, ...(await chrome.storage.sync.get(DEFAULTS)) };
  const report = await ask('diorama:report');
  renderReport(report);
  renderControls();

  $('theme').addEventListener('change', (e) => {
    showPreview(e.target.value);
    save({ theme: e.target.value });
  });
  $('mark').addEventListener('change', (e) => save({ mark: e.target.value }));
  $('fps').addEventListener('change', (e) => save({ fps: Number(e.target.value) }));
  $('enabled').addEventListener('change', (e) => save({ enabled: e.target.checked }));
  $('paused').addEventListener('change', (e) => save({ paused: e.target.checked }));
  $('site').addEventListener('change', (e) => {
    const others = settings.disabledSites.filter((h) => h !== host);
    save({ disabledSites: e.target.checked ? others : [...others, host] });
  });
  $('inspect').addEventListener('click', inspect);
}

init();
