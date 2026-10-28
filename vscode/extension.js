'use strict';

const vscode = require('vscode');
const core = require('./src/core');

const SKIN_BY_APP = [
  [/cursor/i, 'cursor'],
  [/windsurf/i, 'windsurf'],
];

function skinIds() {
  const name = vscode.env.appName || '';
  const hit = SKIN_BY_APP.find(([re]) => re.test(name));
  return [hit ? hit[1] : 'vscode'];
}

const catalog = (context) => core.createCatalog({ roots: [core.userHome(), context.extensionPath] });
const settings = () => vscode.workspace.getConfiguration('diorama');

function applyTheme(context, themeId) {
  const cat = catalog(context);
  const theme = cat.theme(themeId);
  if (!theme) throw new Error(`No theme "${themeId}" is installed.`);
  const skins = skinIds().map((id) => cat.skin(id)).filter(Boolean);
  const fps = settings().get('fps');
  const set = { ...(settings().get('options') || {}) };
  if (settings().get('style')) set.mark = settings().get('style');
  return core.workbench.apply({ appRoot: vscode.env.appRoot, theme, skins, options: { ...(fps ? { fps } : {}), set } });
}

async function offerReload(message) {
  const choice = await vscode.window.showInformationMessage(message, 'Reload Window');
  if (choice) await vscode.commands.executeCommand('workbench.action.reloadWindow');
}

function showError(err) {
  vscode.window.showErrorMessage(`diorama: ${err.message}${err.hint ? ` ${err.hint}` : ''}`);
}

async function cmdApply(context) {
  const items = catalog(context)
    .themes()
    .map((t) => ({ label: t.name, description: t.id, detail: t.description, id: t.id }));
  const pick = await vscode.window.showQuickPick(items, { placeHolder: 'Theme for this editor' });
  if (!pick) return;
  try {
    applyTheme(context, pick.id);
    await settings().update('theme', pick.id, vscode.ConfigurationTarget.Global);
    await offerReload(`diorama: ${pick.label} applied. Reload to see it.`);
  } catch (err) {
    showError(err);
  }
}

async function cmdRestore() {
  try {
    const result = core.workbench.restore({ appRoot: vscode.env.appRoot });
    await settings().update('theme', '', vscode.ConfigurationTarget.Global);
    if (result.changed) await offerReload('diorama: theme removed. Reload to finish.');
    else vscode.window.showInformationMessage('diorama: no theme was applied.');
  } catch (err) {
    showError(err);
  }
}

function cmdStatus() {
  try {
    const s = core.workbench.status({ appRoot: vscode.env.appRoot });
    const what = s.patched ? `"${s.manifest ? s.manifest.theme : 'unknown'}" is applied` : 'no theme is applied';
    const note = s.checksumOk ? '' : ' Restart the editor once to clear the "corrupt installation" notice.';
    vscode.window.showInformationMessage(`diorama: ${what} to ${s.name} ${s.version}.${note}`);
  } catch (err) {
    showError(err);
  }
}

async function reapplyIfNeeded(context) {
  const wanted = settings().get('theme');
  if (!wanted || !settings().get('reapplyAfterUpdate')) return;
  let s;
  try {
    s = core.workbench.status({ appRoot: vscode.env.appRoot });
  } catch {
    return;
  }
  const m = s.patched && s.manifest;
  if (m && m.theme === wanted && m.tool === core.VERSION) return;
  try {
    applyTheme(context, wanted);
    await offerReload(`diorama: re-applied "${wanted}" after an update. Reload to see it.`);
  } catch (err) {
    showError(err);
  }
}

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('diorama.apply', () => cmdApply(context)),
    vscode.commands.registerCommand('diorama.restore', cmdRestore),
    vscode.commands.registerCommand('diorama.status', cmdStatus),
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      const wanted = settings().get('theme');
      if (!wanted || !['diorama.style', 'diorama.options', 'diorama.fps'].some((k) => e.affectsConfiguration(k))) return;
      try {
        applyTheme(context, wanted);
        await offerReload('diorama: settings changed. Reload to see the change.');
      } catch (err) {
        showError(err);
      }
    }),
  );
  reapplyIfNeeded(context);
}

function deactivate() {}

module.exports = { activate, deactivate };
