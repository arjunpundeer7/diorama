'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');
const core = require('../core');
const apps = require('./apps');
const terminal = require('./terminal');
const state = require('./state');
const build = require('./build');
const preview = require('./preview');
const scaffold = require('./scaffold');
const { launch, sleep } = require('./launch');
const { UserError, c, out, table } = require('./ui');

const HELP = `diorama ${core.VERSION}: animated themes for AI app windows

Try
  diorama preview                       Gallery of every theme, in your browser
  diorama preview lagoon                One theme in a demo chat app
  diorama apply lagoon cursor vscode    Theme your editors (reload their windows after)
  diorama launch codex --theme lagoon   Theme the Codex app while this runs

Commands
  list                               Themes, skins and the apps found on this machine
  preview [theme]                    Demo app with a theme; --screenshot <png> to save one
  apply <theme> <app...|all>         Apply and keep applied: editors and terminals
  restore <app...|all>               Undo apply
  status                             What is applied where
  launch <app>                       Start a desktop app themed (Codex, editors, any Electron app)
  new theme <id> [--from <theme>]    Copy a theme into ~/.diorama/themes to make your own
  new skin <id> --url <pattern>      Start a skin for another app or site
  new app <id> --exe <file>          Register another Electron app for launch
  build <extension|vscode|site|all>  Build the browser extension, editor extension or demo site
  doctor                             Check installs and permissions

Options
  --set <key=value>      Theme option, e.g. --set mark=braille --set turtles=6 (repeatable)
  --theme <id>           Theme for launch (default: lagoon)
  --fps <n>              Cap the frame rate
  --scheme <s>           auto, light or dark
  --mark <m>             Shortcut for --set mark=<m>: ascii, braille, halftone, dither, mosaic, teletext
  --path <dir>           Editor's resources/app folder if not detected
  --settings <file>      Terminal config file if not detected
  --exe <file>           App executable (launch, new app)
  --skin <id>            Skin for a new app
  --url <url>            Page to open (launch with a browser) or pages a new skin matches
  --user-data-dir <dir>  Separate app profile (launch)
  --restart              Quit the running app first (launch)
  --report, --inspect    Show what the skin matched and what still hides the background (launch)
  --screenshot <file>    Save a PNG (launch, preview)
  --size <WxH>           Screenshot size (preview, default 1440x900)
  --write-previews       Regenerate every theme's preview.png (preview)
  --out <dir>            Output folder (build, default ~/.diorama/build)
  --stage                Hide the demo app and show only the background (preview)
  --no-open              Don't open the browser (preview)
  -- <args...>           Pass the rest to the app (launch)
`;

const OPTIONS = {
  theme: { type: 'string' },
  set: { type: 'string', multiple: true },
  mark: { type: 'string' },
  fps: { type: 'string' },
  scheme: { type: 'string' },
  path: { type: 'string' },
  settings: { type: 'string' },
  exe: { type: 'string' },
  skin: { type: 'string' },
  name: { type: 'string' },
  from: { type: 'string' },
  dir: { type: 'string' },
  url: { type: 'string' },
  out: { type: 'string' },
  browser: { type: 'string' },
  size: { type: 'string' },
  'user-data-dir': { type: 'string' },
  port: { type: 'string' },
  restart: { type: 'boolean' },
  report: { type: 'boolean' },
  inspect: { type: 'boolean' },
  screenshot: { type: 'string' },
  'write-previews': { type: 'boolean' },
  'no-open': { type: 'boolean' },
  stage: { type: 'boolean' },
  wait: { type: 'string' },
  once: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
};

const home = () => core.userHome();

function loadCatalog() {
  const catalog = core.createCatalog();
  for (const e of catalog.errors) {
    console.error(c.yellow(`warning: skipped ${path.relative(process.cwd(), e.file)}: ${e.problems.join('; ')}`));
  }
  return catalog;
}

function pickTheme(catalog, id) {
  const t = catalog.theme(id || 'lagoon') || (!id && catalog.themes()[0]);
  if (!t) throw new UserError(`No theme "${id}".`, `Installed: ${catalog.themes().map((x) => x.id).join(', ') || 'none'}`);
  return t;
}

function getApp(id) {
  const app = apps.byId(id);
  if (!app) throw new UserError(`Unknown app "${id}".`, `Known: ${apps.all().map((a) => a.id).join(', ')}`);
  return apps.detect(app);
}

function themeOverrides(values) {
  const set = {};
  for (const pair of values.set || []) {
    const at = pair.indexOf('=');
    if (at < 1) throw new UserError(`--set wants key=value, got "${pair}".`);
    set[pair.slice(0, at)] = preview.parseValue(pair.slice(at + 1));
  }
  if (values.mark) set.mark = values.mark;
  return set;
}

function runtimeOptions(values) {
  const options = {};
  if (values.fps) {
    const fps = Number(values.fps);
    if (!(fps >= 1 && fps <= 120)) throw new UserError('--fps must be between 1 and 120.');
    options.fps = fps;
  }
  if (values.scheme) {
    if (!['auto', 'light', 'dark'].includes(values.scheme)) throw new UserError('--scheme must be auto, light or dark.');
    if (values.scheme !== 'auto') options.scheme = values.scheme;
  }
  const set = themeOverrides(values);
  if (Object.keys(set).length) options.set = set;
  return options;
}

function skinsFor(catalog, ids) {
  return ids.map((id) => {
    const skin = catalog.skin(id);
    if (!skin) throw new UserError(`Skin "${id}" is missing or invalid.`);
    return skin;
  });
}

function editorRoot(app, values) {
  const appRoot = values.path || app.appRoot;
  if (!appRoot) throw new UserError(`Could not find ${app.name}.`, 'Pass its resources/app folder with --path <dir>.');
  return appRoot;
}

function persistentTargets(ids) {
  if (ids.length === 1 && ids[0] === 'all') {
    return apps
      .all()
      .map(apps.detect)
      .filter((a) => {
        if (a.kind === 'workbench') return a.installed && a.appRoot;
        if (a.id === 'windows-terminal') return a.installed && terminal.windowsTerminalSettings();
        if (a.id === 'ghostty') return a.installed && fs.existsSync(terminal.ghosttyConfig());
        return false;
      });
  }
  return ids.map(getApp);
}

function cmdList() {
  const catalog = loadCatalog();
  out(c.bold('Themes'));
  table(catalog.themes().map((t) => [c.cyan(t.id), t.name, c.dim(t.tagline || t.description || '')]));
  out('', c.bold('Skins'));
  table(catalog.skins().map((k) => [c.cyan(k.id), k.name, statusLabel(k.status)]));
  out('', c.bold('Apps on this machine'));
  table(apps.all().map(apps.detect).map(appRow));
}

function statusLabel(status) {
  if (status === 'verified') return c.green('verified');
  if (status === 'unverified') return c.yellow('unverified');
  return c.dim(status || 'draft');
}

function appRow(a) {
  const how = { workbench: 'apply, launch', electron: 'launch', browser: 'launch', terminal: 'apply', blocked: c.yellow('not supported') }[a.kind];
  const found = a.installed ? c.green(a.version || 'found') : c.dim('not found');
  return [c.cyan(a.id), a.name, found, how];
}

function applyOne(app, theme, catalog, values, options) {
  if (app.kind === 'workbench') {
    const appRoot = editorRoot(app, values);
    const result = core.workbench.apply({ appRoot, theme, skins: skinsFor(catalog, app.skins), options });
    state.update(home(), (s) => (s.editors[app.id] = { appRoot, theme: theme.id, version: result.version, appliedAt: new Date().toISOString() }));
    out(`${c.green('applied')}  ${app.name} ${result.version}  ${c.dim('reload its windows to see it')}`);
    return;
  }
  if (app.id === 'windows-terminal') {
    const r = terminal.installWindowsTerminal({ theme, settingsPath: values.settings, home: home() });
    state.update(home(), (s) => (s.terminals['windows-terminal'] = { ...r, theme: theme.id }));
    out(`${c.green('applied')}  Windows Terminal  ${c.dim('all profiles')}`);
    return;
  }
  if (app.id === 'ghostty') {
    const r = terminal.installGhostty({ theme, configPath: values.settings, home: home() });
    state.update(home(), (s) => (s.terminals.ghostty = { ...r, theme: theme.id }));
    out(`${c.green('applied')}  Ghostty  ${c.dim('reload its config')}`);
    return;
  }
  if (app.kind === 'electron') throw new UserError(`${app.name} has no persistent mode.`, `Use: diorama launch ${app.id} --theme ${theme.id}`);
  if (app.kind === 'browser') throw new UserError('Browsers are themed by the extension.', 'Run: diorama build extension');
  throw new UserError(`${app.name} is not supported.`, app.reason);
}

function cmdApply(themeId, ids, values) {
  if (!themeId || !ids.length) throw new UserError('Usage: diorama apply <theme> <app...|all>');
  const catalog = loadCatalog();
  const theme = pickTheme(catalog, themeId);
  const options = runtimeOptions(values);
  const targets = persistentTargets(ids);
  if (!targets.length) throw new UserError('No supported editors or terminals found.');
  out(`${theme.name}`);
  let failed = 0;
  for (const app of targets) {
    try {
      applyOne(app, theme, catalog, values, options);
    } catch (err) {
      if (!(err instanceof UserError) && err.name !== 'PatchError') throw err;
      failed++;
      out(`${c.red('failed')}   ${app.name}: ${err.message}${err.hint ? c.dim(' ' + err.hint) : ''}`);
    }
  }
  if (targets.some((a) => a.kind === 'workbench')) {
    out(c.dim('Editor updates remove the theme; run this again after one, or install the editor extension (diorama build vscode).'));
  }
  if (failed) process.exitCode = 1;
}

function restoreOne(app, values, saved) {
  if (app.kind === 'workbench') {
    const appRoot = values.path || (saved.editors[app.id] && saved.editors[app.id].appRoot) || editorRoot(app, values);
    const r = core.workbench.restore({ appRoot });
    state.update(home(), (s) => delete s.editors[app.id]);
    return r.changed;
  }
  if (app.id === 'windows-terminal') {
    const entry = saved.terminals['windows-terminal'] || {};
    const r = terminal.restoreWindowsTerminal({ ...entry, settingsPath: values.settings || entry.settingsPath });
    state.update(home(), (s) => delete s.terminals['windows-terminal']);
    return r.changed;
  }
  if (app.id === 'ghostty') {
    const entry = saved.terminals.ghostty || {};
    const r = terminal.restoreGhostty({ configPath: values.settings || entry.configPath });
    state.update(home(), (s) => delete s.terminals.ghostty);
    return r.changed;
  }
  throw new UserError(`Nothing to restore for ${app.name}; it has no persistent mode.`);
}

function cmdRestore(ids, values) {
  if (!ids.length) throw new UserError('Usage: diorama restore <app...|all>');
  const saved = { editors: {}, terminals: {}, ...state.load(home()) };
  for (const app of persistentTargets(ids)) {
    const changed = restoreOne(app, values, saved);
    out(changed ? `${c.green('restored')} ${app.name}` : `${c.dim('clean')}    ${app.name}`);
  }
}

function cmdStatus(values) {
  const saved = state.load(home());
  const rows = [];
  for (const a of apps.APPS.filter((x) => x.kind === 'workbench').map(apps.detect)) {
    const appRoot = (a.id === values.app && values.path) || a.appRoot;
    if (!appRoot) continue;
    try {
      const s = core.workbench.status({ appRoot });
      const what = s.patched
        ? `${c.green(s.manifest ? s.manifest.theme : 'themed')}${s.checksumOk ? '' : c.yellow(' (restart the editor once)')}`
        : saved.editors && saved.editors[a.id]
          ? c.yellow(`removed by an update; run: diorama apply ${saved.editors[a.id].theme} ${a.id}`)
          : c.dim('not themed');
      rows.push([c.cyan(a.id), `${a.name} ${s.version}`, what]);
    } catch (err) {
      rows.push([c.cyan(a.id), a.name, c.red(err.message)]);
    }
  }
  for (const [id, t] of Object.entries(saved.terminals || {})) rows.push([c.cyan(id), getApp(id).name, c.green(t.theme)]);
  if (!rows.length) out('Nothing found.');
  else table(rows);
}

function cmdDoctor() {
  out(`${c.bold('diorama')} ${core.VERSION} on ${process.platform}, Node ${process.versions.node}`);
  if (Number(process.versions.node.split('.')[0]) < 22) out(c.yellow('  diorama launch needs Node 22 or newer.'));
  const catalog = loadCatalog();
  out(`  ${catalog.themes().length} themes, ${catalog.skins().length} skins, your folder: ${home()}`, '');
  for (const a of apps.all().map(apps.detect)) {
    if (!a.installed) {
      out(`${c.dim('-')} ${a.name}: ${c.dim('not found')}`);
      continue;
    }
    if (a.kind === 'workbench') {
      let note = c.green('ok');
      try {
        const loc = core.workbench.locate(a.appRoot);
        fs.closeSync(fs.openSync(loc.htmlPath, 'r+'));
      } catch (err) {
        note = c.yellow(err.code === 'EACCES' || err.code === 'EPERM' ? 'not writable; apply needs an admin shell' : err.message);
      }
      out(`${c.green('+')} ${a.name} ${a.version || ''}: ${note}`, c.dim(`    ${a.appRoot}`));
    } else if (a.kind === 'blocked') {
      out(`${c.yellow('!')} ${a.name}: ${a.reason}`);
    } else if (a.kind === 'terminal') {
      const where = a.id === 'windows-terminal' ? terminal.windowsTerminalSettings() : terminal.ghosttyConfig();
      out(`${c.green('+')} ${a.name}: ${where ? c.dim(where) : c.yellow('settings file not found')}`);
    } else {
      out(`${c.green('+')} ${a.name} ${a.version || ''}: launch`, c.dim(`    ${a.exe}`));
    }
  }
}

async function cmdLaunch(target, values, passthrough) {
  if (!target) throw new UserError('Usage: diorama launch <app>');
  const catalog = loadCatalog();
  const theme = pickTheme(catalog, values.theme);
  let app;
  if (apps.byId(target)) app = getApp(target);
  else if (fs.existsSync(target)) app = { id: 'custom', name: path.basename(target), kind: 'electron', exe: path.resolve(target), installed: true };
  else throw new UserError(`Unknown app "${target}".`, `Known: ${apps.all().map((a) => a.id).join(', ')}, or a path to an executable.`);

  if (app.kind === 'blocked') throw new UserError(`${app.name} cannot be themed.`, app.reason);
  if (app.kind === 'terminal') throw new UserError(`Terminals are themed with: diorama apply ${theme.id} ${app.id}`);
  if (!app.installed && !values.exe) throw new UserError(`${app.name} is not installed where diorama looks.`, 'Pass --exe <file>.');

  const skins = app.skins && app.skins.length ? skinsFor(catalog, app.skins) : app.kind === 'browser' ? catalog.webSkins() : catalog.skins();
  out(`Starting ${app.name} with ${theme.name}...`);
  const session = await launch({
    app,
    theme,
    skins,
    exe: values.exe,
    url: values.url,
    userDataDir: values['user-data-dir'],
    port: values.port ? Number(values.port) : undefined,
    restart: values.restart,
    args: passthrough,
    options: runtimeOptions(values),
    home: home(),
    log: (msg) => console.error(c.dim(`  ${msg}`)),
  });
  out(c.dim(`  DevTools on 127.0.0.1:${session.port} (${session.product})`));

  if (values.report || values.inspect || values.screenshot || values.once) await sleep(Number(values.wait || 4) * 1000);
  if (values.report || values.once) printReports(await session.injector.report());
  if (values.inspect) printInspect(await session.injector.inspect());
  if (values.screenshot) {
    const file = await session.injector.screenshot(values.screenshot);
    out(file ? `Screenshot: ${path.resolve(file)}` : c.yellow('No window to capture.'));
  }
  if (values.once) {
    session.conn.close();
    out(c.dim('Detached. Open windows keep the theme until they reload.'));
    return;
  }
  out(`${c.green('Themed.')} Keep this running; reloads and new windows stay themed. Ctrl+C stops.`);
  const stopSignal = new Promise((resolve) => process.once('SIGINT', resolve));
  await Promise.race([session.closed, stopSignal]);
  session.conn.close();
  out(c.dim('Stopped.'));
}

function printReports(results) {
  for (const { value: r } of results) {
    if (!r) continue;
    if (!r.mounted) {
      out(`${c.dim('-')} ${r.url} ${c.dim('(no skin matched)')}`);
      continue;
    }
    out(`${c.green('+')} ${r.url}`, `    ${c.dim(`skin ${r.skin} / theme ${r.theme} / ${r.scheme} / renderer ${r.renderer}`)}`);
    const slots = r.slots.map((s) => (s.matches ? `${s.name} ${c.green(s.matches)}` : `${s.name} ${(s.required ? c.red : c.yellow)('0')}`));
    out(`    slots: ${slots.join('  ')}`);
    if (r.vars) out(`    vars scope matches: ${r.vars.matches ? c.green(r.vars.matches) : c.red(0)}`);
    if (r.missing && r.missing.length) out(c.red(`    missing required slots: ${r.missing.join(', ')}`));
    for (const e of r.errors || []) out(c.red(`    theme error: ${e.split('\n')[0]}`));
  }
}

function printInspect(results) {
  for (const { value } of results) {
    if (!value) continue;
    out('', `${c.bold('Still hiding the background')} on ${value.url}`);
    if (!value.blockers.length) {
      out(c.green('  nothing: the background shows through everywhere sampled'));
      continue;
    }
    table(value.blockers.slice(0, 15).map((b) => [`${b.coverage}%`, b.size, b.selector, c.dim(b.background)]));
  }
}

function printThemeErrors(report) {
  if (!report) return out(c.yellow('  the theme did not mount'));
  if (report.renderer !== 'running') out(c.yellow(`  renderer: ${report.renderer}`));
  for (const e of report.errors || []) out(c.red(`  theme error: ${e}`));
}

function parseSize(size) {
  const m = /^(\d+)x(\d+)$/.exec(size || '1440x900');
  if (!m) throw new UserError('--size wants WIDTHxHEIGHT, e.g. 1440x900.');
  return { width: Number(m[1]), height: Number(m[2]) };
}

async function cmdPreview(themeId, values) {
  const catalog = loadCatalog();
  const server = await preview.startServer({ catalog, port: values.port ? Number(values.port) : 0, set: themeOverrides(values) });
  const query = (t, extra = {}) => {
    const q = new URLSearchParams({ theme: t.id, ...extra });
    if (values.scheme && values.scheme !== 'auto') q.set('scheme', values.scheme);
    if (values.stage) q.set('stage', '1');
    return q;
  };
  try {
    if (values['write-previews']) {
      for (const t of catalog.themes()) {
        const file = path.join(t.dir, 'preview.png');
        const shot = await preview.screenshot({ url: `${server.url}/?${query(t, { bare: '1', stage: '1' })}`, file, width: 960, height: 600, browser: values.browser, wait: Number(values.wait || 4) });
        out(`${c.green('wrote')} ${file}`);
        printThemeErrors(shot.report);
      }
      return;
    }
    if (values.screenshot) {
      const t = pickTheme(catalog, themeId);
      const shot = await preview.screenshot({
        url: `${server.url}/?${query(t, { bare: '1' })}`,
        file: values.screenshot,
        ...parseSize(values.size),
        browser: values.browser,
        wait: Number(values.wait || 4),
      });
      out(`Screenshot: ${shot.file}`);
      printThemeErrors(shot.report);
      return;
    }
    const url = themeId ? `${server.url}/?${query(pickTheme(catalog, themeId))}` : `${server.url}/gallery`;
    out(`Preview at ${c.cyan(url)}`, c.dim('Edit a theme and reload the page to see changes. Ctrl+C stops.'));
    if (!values['no-open']) preview.openInBrowser(url);
    await new Promise((resolve) => process.once('SIGINT', resolve));
  } finally {
    await server.close();
  }
}

function cmdNew(kind, id, values) {
  const catalog = loadCatalog();
  if (kind === 'theme') {
    const from = pickTheme(catalog, values.from || 'drift');
    const dir = values.dir || path.join(home(), 'themes');
    const target = scaffold.newTheme({ id, from, dir });
    out(`Created ${target}`, '', `  diorama preview ${id}        try it`, `  ${path.join(target, 'scene.js')}`, `  ${path.join(target, 'theme.json')}`);
    if (values.dir) out(c.dim(`Themes outside ${path.join(home(), 'themes')} and this repo's themes/ folder are not picked up automatically.`));
    return;
  }
  if (kind === 'skin') {
    const file = scaffold.newSkin({ id, url: values.url, home: home() });
    out(`Created ${file}`, '', 'Fill it in with what the inspector reports:', `  diorama launch <app> --report --inspect`);
    return;
  }
  if (kind === 'app') {
    const file = scaffold.newApp({ id, exe: values.exe, skin: values.skin, name: values.name, home: home() });
    out(`Added ${id} to ${file}`, '', `  diorama launch ${id} --report --inspect`);
    return;
  }
  throw new UserError('Usage: diorama new <theme|skin|app> <id>');
}

function cmdBuild(target, values) {
  const catalog = loadCatalog();
  const base = values.out || path.join(home(), 'build');
  const which = target || 'all';
  if (!['extension', 'vscode', 'site', 'all'].includes(which)) throw new UserError('Usage: diorama build <extension|vscode|site|all>');
  if (which === 'extension' || which === 'all') {
    const r = build.buildExtension({ out: path.join(base, 'extension'), catalog });
    out(`${c.green('built')} ${r.out}`, c.dim(`  ${r.themes} themes for ${r.matches.join(', ')}`), c.dim('  Load it in chrome://extensions (Developer mode, Load unpacked).'));
  }
  if (which === 'site' || which === 'all') {
    const r = build.buildSite({ out: path.join(base, 'site'), catalog });
    out(`${c.green('built')} ${r.out}`, c.dim(`  ${r.themes} themes. Static files: host it anywhere, e.g. GitHub Pages.`));
  }
  if (which === 'vscode' || which === 'all') {
    const r = build.buildVscode({ out: path.join(base, 'vscode'), catalog });
    out(`${c.green('built')} ${r.out}`, c.dim('  Package it: npx @vscode/vsce package --no-dependencies'));
  }
}

async function main(argv) {
  const split = argv.indexOf('--');
  const passthrough = split === -1 ? [] : argv.slice(split + 1);
  const args = split === -1 ? argv : argv.slice(0, split);
  try {
    const { values, positionals } = parseArgs({ args, options: OPTIONS, allowPositionals: true });
    const [command, ...rest] = positionals;
    apps.useHome(home());
    if (values.version) return out(core.VERSION);
    if (values.help || !command || command === 'help') return out(HELP);
    switch (command) {
      case 'list':
        return cmdList();
      case 'preview':
        return await cmdPreview(rest[0], values);
      case 'apply':
        return cmdApply(rest[0], rest.slice(1), values);
      case 'restore':
        return cmdRestore(rest, values);
      case 'status':
        return cmdStatus({ ...values, app: rest[0] });
      case 'doctor':
        return cmdDoctor();
      case 'launch':
        return await cmdLaunch(rest[0], values, passthrough);
      case 'new':
        return cmdNew(rest[0], rest[1], values);
      case 'build':
        return cmdBuild(rest[0], values);
      default:
        throw new UserError(`Unknown command "${command}".`, 'Run diorama help.');
    }
  } catch (err) {
    if (err instanceof UserError || err.name === 'PatchError' || err.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION') {
      console.error(c.red(err.message));
      if (err.hint) console.error(err.hint);
      process.exitCode = 1;
      return;
    }
    throw err;
  }
}

module.exports = { main };
