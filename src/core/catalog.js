'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const ID = /^[a-z0-9][a-z0-9-]*$/;
const ROLES = ['clear', 'glass', 'strong', 'blur'];
const PALETTE_KEYS = ['base', 'glass', 'glassStrong', 'border', 'blur', 'scrim', 'accent', 'text'];
const MARKS = ['ascii', 'braille', 'halftone', 'dither', 'mosaic', 'teletext'];

function userHome() {
  return process.env.DIORAMA_HOME || path.join(os.homedir(), '.diorama');
}

function repoRoot() {
  return path.resolve(__dirname, '..', '..');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStrList = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string' && x.trim());

function validateTheme(t, dir) {
  const errors = [];
  if (!isObj(t)) return ['theme.json must be an object'];
  if (typeof t.id !== 'string' || !ID.test(t.id)) errors.push('id must be lowercase letters, digits and dashes');
  if (dir && t.id && path.basename(dir) !== t.id) errors.push(`id "${t.id}" must match its folder name`);
  if (typeof t.name !== 'string' || !t.name) errors.push('name is required');
  if (typeof t.version !== 'string') errors.push('version is required');
  if (typeof t.scene !== 'string') errors.push('scene must name the scene script, e.g. "scene.js"');
  else if (dir && !fs.existsSync(path.join(dir, t.scene))) errors.push(`scene file ${t.scene} not found`);
  if (t.fps !== undefined && !(Number.isFinite(t.fps) && t.fps >= 1 && t.fps <= 120)) errors.push('fps must be 1-120');
  if (t.resolution !== undefined && !(Number.isFinite(t.resolution) && t.resolution > 0 && t.resolution <= 2)) {
    errors.push('resolution must be between 0 and 2');
  }
  if (!isObj(t.palette) || (!t.palette.light && !t.palette.dark)) {
    errors.push('palette needs a "light" and/or "dark" entry');
  }
  if (isObj(t.palette)) {
    for (const scheme of Object.keys(t.palette)) {
      if (scheme !== 'light' && scheme !== 'dark') errors.push(`palette.${scheme}: only light and dark are allowed`);
      const p = t.palette[scheme];
      if (!isObj(p)) continue;
      for (const [k, v] of Object.entries(p)) {
        if (!PALETTE_KEYS.includes(k)) errors.push(`palette.${scheme}.${k} is not a palette key (${PALETTE_KEYS.join(', ')})`);
        else if (typeof v !== 'string') errors.push(`palette.${scheme}.${k} must be a CSS value string`);
      }
    }
  }
  if (t.scheme !== undefined && t.scheme !== 'light' && t.scheme !== 'dark') errors.push('scheme must be light or dark');
  if (t.options !== undefined && !isObj(t.options)) errors.push('options must be an object');
  else if (t.options && t.options.mark !== undefined && !MARKS.includes(t.options.mark)) {
    errors.push(`options.mark must be one of ${MARKS.join(', ')}`);
  }
  if (t.terminal !== undefined) {
    if (!isObj(t.terminal)) errors.push('terminal must be an object');
    else {
      for (const [k, file] of Object.entries(t.terminal)) {
        if (!['windowsTerminal', 'ghostty'].includes(k)) errors.push(`terminal.${k} is not a known terminal`);
        else if (dir && !fs.existsSync(path.join(dir, file))) errors.push(`terminal.${k}: ${file} not found`);
      }
    }
  }
  return errors;
}

function validateSkin(k) {
  const errors = [];
  if (!isObj(k)) return ['skin must be an object'];
  if (typeof k.id !== 'string' || !ID.test(k.id)) errors.push('id must be lowercase letters, digits and dashes');
  if (typeof k.name !== 'string' || !k.name) errors.push('name is required');
  if (k.extends !== undefined && typeof k.extends !== 'string') errors.push('extends must be a skin id');
  if (!k.extends && (!isObj(k.match) || !isStrList(k.match.urls) || !k.match.urls.length)) {
    errors.push('match.urls must list at least one URL pattern');
  }
  if (isObj(k.match) && k.match.exclude !== undefined && !isStrList(k.match.exclude)) {
    errors.push('match.exclude must be a list of URL patterns');
  }
  if (k.slots !== undefined) {
    if (!Array.isArray(k.slots)) errors.push('slots must be an array');
    else {
      k.slots.forEach((sl, i) => {
        const at = `slots[${i}]`;
        if (!isObj(sl)) return errors.push(`${at} must be an object`);
        if (typeof sl.name !== 'string' || !sl.name) errors.push(`${at}.name is required`);
        if (!ROLES.includes(sl.role)) errors.push(`${at}.role must be one of ${ROLES.join(', ')}`);
        if (!isStrList(sl.selectors) || !sl.selectors.length) errors.push(`${at}.selectors must be a non-empty list`);
      });
    }
  }
  if (k.vars !== undefined) {
    if (!isObj(k.vars) || !isObj(k.vars.values)) errors.push('vars.values must map CSS custom properties to values');
    else {
      for (const name of Object.keys(k.vars.values)) {
        if (!name.startsWith('--')) errors.push(`vars.values: "${name}" is not a custom property`);
      }
      if (k.vars.scope !== undefined && !isStrList(k.vars.scope)) errors.push('vars.scope must be a list of selectors');
    }
  }
  if (k.scheme !== undefined) {
    if (!isObj(k.scheme)) errors.push('scheme must be an object');
    else {
      for (const key of ['dark', 'light']) {
        if (k.scheme[key] !== undefined && !isStrList(k.scheme[key])) errors.push(`scheme.${key} must be a list of selectors`);
      }
    }
  }
  return errors;
}

function mergeSkins(parent, child) {
  return {
    ...parent,
    ...child,
    match: child.match || parent.match,
    scheme: { ...(parent.scheme || {}), ...(child.scheme || {}) },
    vars:
      parent.vars || child.vars
        ? {
            scope: (child.vars && child.vars.scope) || (parent.vars && parent.vars.scope),
            values: { ...((parent.vars && parent.vars.values) || {}), ...((child.vars && child.vars.values) || {}) },
          }
        : undefined,
    slots: [...(parent.slots || []), ...(child.slots || [])],
    css: [parent.css, child.css].filter(Boolean).join('\n'),
  };
}

function createCatalog(options = {}) {
  const roots = options.roots || [userHome(), repoRoot()];
  const themes = new Map();
  const rawSkins = new Map();
  const errors = [];

  for (const root of roots) {
    const themeDir = path.join(root, 'themes');
    if (fs.existsSync(themeDir)) {
      for (const entry of fs.readdirSync(themeDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const dir = path.join(themeDir, entry.name);
        const file = path.join(dir, 'theme.json');
        if (!fs.existsSync(file)) continue;
        try {
          const t = readJson(file);
          const problems = validateTheme(t, dir);
          if (problems.length) errors.push({ file, problems });
          else if (!themes.has(t.id)) themes.set(t.id, { ...t, dir, file, scenePath: path.join(dir, t.scene) });
        } catch (err) {
          errors.push({ file, problems: [err.message] });
        }
      }
    }
    const skinDir = path.join(root, 'skins');
    if (fs.existsSync(skinDir)) {
      for (const name of fs.readdirSync(skinDir)) {
        if (!name.endsWith('.json')) continue;
        const file = path.join(skinDir, name);
        try {
          const k = readJson(file);
          const problems = validateSkin(k);
          if (k.stylesheet) {
            const cssFile = path.join(skinDir, k.stylesheet);
            if (fs.existsSync(cssFile)) k.css = fs.readFileSync(cssFile, 'utf8');
            else problems.push(`stylesheet ${k.stylesheet} not found`);
          }
          if (problems.length) errors.push({ file, problems });
          else if (!rawSkins.has(k.id)) rawSkins.set(k.id, { ...k, file });
        } catch (err) {
          errors.push({ file, problems: [err.message] });
        }
      }
    }
  }

  const resolved = new Map();
  function resolveSkin(id, seen = []) {
    if (resolved.has(id)) return resolved.get(id);
    const k = rawSkins.get(id);
    if (!k) return null;
    if (seen.includes(id)) throw new Error(`skin "${id}" extends itself (${[...seen, id].join(' -> ')})`);
    let out = k;
    if (k.extends) {
      const parent = resolveSkin(k.extends, [...seen, id]);
      if (!parent) throw new Error(`skin "${id}" extends unknown skin "${k.extends}"`);
      out = mergeSkins(parent, k);
    }
    resolved.set(id, out);
    return out;
  }
  for (const id of rawSkins.keys()) {
    try {
      resolveSkin(id);
    } catch (err) {
      errors.push({ file: rawSkins.get(id).file, problems: [err.message] });
    }
  }

  return {
    roots,
    errors,
    themes: () => [...themes.values()],
    skins: () => [...resolved.values()],
    theme: (id) => themes.get(id) || null,
    skin: (id) => resolved.get(id) || null,
    webSkins: () => [...resolved.values()].filter((k) => k.match.urls.some((u) => /^https?:\/\//.test(u))),
  };
}

function runtimeTheme(t) {
  return {
    id: t.id,
    name: t.name,
    fps: t.fps || 30,
    resolution: t.resolution || 1,
    palette: t.palette,
    options: t.options || {},
  };
}

function runtimeSkin(k) {
  return {
    id: k.id,
    match: k.match,
    scheme: k.scheme || {},
    vars: k.vars,
    slots: k.slots || [],
    css: k.css || '',
  };
}

module.exports = {
  createCatalog,
  validateTheme,
  validateSkin,
  mergeSkins,
  runtimeTheme,
  runtimeSkin,
  userHome,
  repoRoot,
  ROLES,
  PALETTE_KEYS,
  MARKS,
};
