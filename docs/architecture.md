# How diorama works

```
                    ┌──────────────────────── host app page ────────────────────────┐
  theme.json ──┐    │  <html class="diorama-on">                                        │
  skin.json  ──┼──► │    <style id="diorama-style">   generated from skin + palette     │
               │    │    <div id="diorama-root">      fixed, behind everything          │
  runtime.js ──┘    │      <iframe sandbox="allow-scripts">  ◄── renderer + scene.js │
                    │      <div scrim>                                               │
                    │    <body> …the app, its surfaces made clear or frosted…        │
                    └────────────────────────────────────────────────────────────────┘
```

Every target uses the same pieces from `runtime/`:

- **runtime.js** runs in the app page. It picks the skin for the page URL, writes one
  stylesheet, mounts a fixed layer behind the app, tracks light/dark mode, and puts
  itself back if the app removes it. It never runs theme code, and uses no
  `innerHTML`, `srcdoc` or `eval` (the VS Code workbench enforces Trusted Types).
- **renderer.js** runs inside the sandboxed iframe. It owns the canvas and the frame
  loop and calls the theme's scene. The frame has an opaque origin, so the scene cannot
  read the app.
- **engine.js** also runs in the iframe and gives scenes the cell grid and its six mark
  styles, plus noise and colour helpers. See [themes.md](themes.md).

They talk by `postMessage`: the renderer says `hello`, the runtime answers with the
config (palette, scheme, fps), then sends `scheme`, `pause` and `resume`.

## Getting into each app

| Target | Package | How the runtime gets in | How the renderer gets its scene |
| --- | --- | --- | --- |
| claude.ai, chatgpt.com | `extension/`, `diorama build extension` | content script | `renderer.html?theme=<id>`, a sandboxed extension page |
| VS Code, Cursor, Windsurf (persistent) | `src/core/workbench.js`, `diorama apply`, `vscode/` | `<script src>` added to `workbench.html` | self-contained `diorama/renderer.html`, scene inlined, CSP hash |
| Codex, VS Code family (session) | CLI `launch` | Chrome DevTools Protocol | the CLI evaluates renderer + scene inside the empty sandboxed frame |
| Windows Terminal, Ghostty | CLI `apply` | n/a | the theme's shader |

Notes on each:

- **Extension.** Pages cannot block an extension's own frames, so the renderer is a
  manifest `sandbox` page loaded in the sandboxed iframe.
- **Workbench patch.** The editor's file protocol serves the frame's page but refuses
  its sub-resources, so the renderer page is generated with everything inline and a
  `script-src 'sha256-…'` policy. `product.json` gets the new checksum so the editor
  does not call itself corrupt after the next restart. `restore` strips the block and
  restores the checksum; both files come back byte for byte.
- **Launch.** The app is started with `--remote-debugging-port` on 127.0.0.1. The CLI
  adds the runtime to every window with `Page.addScriptToEvaluateOnNewDocument`. When
  the runtime creates its empty sandboxed frame, the CLI evaluates the renderer and
  scene inside that frame through an isolated world. The app's Content Security Policy
  stays on; the debugger is not subject to it. The scripts are tied to the DevTools
  session, so the CLI stays attached; if it exits, a reload drops the theme.

## Repository layout

```
bin/diorama.js             the command
runtime/                runtime.js, renderer.js, engine.js, renderer.html (no build step)
src/core/               catalog (load + validate), payload (what gets injected), workbench patcher
src/cli/                commands: apps registry, DevTools client, launcher, preview server,
                        terminal installers, scaffolding, extension builds
preview/                the demo app and gallery behind diorama preview
extension/              browser extension sources; diorama build extension assembles it
vscode/                 editor extension; diorama build vscode assembles it
themes/                 one folder per theme
skins/                  one JSON file per app
schemas/                JSON schemas for editor completion
test/                   node:test suites (npm test)
```

## Things learned the hard way

- Run from inside an editor, child processes inherit `ELECTRON_RUN_AS_NODE`, so Electron
  apps start as plain Node ("bad option: --remote-debugging-port"). The launcher strips it,
  along with `VSCODE_*` and the crash-reporter pipe.
- Claude Desktop quits when given a DevTools port. That is a deliberate protection, and
  diorama does not work around it. claude.ai gets the same interface through the extension.
- Codex opens transparent overlay windows (spotlight, avatar) on its main URL with
  `?initialRoute=`. Skins need `match.exclude` for those.
- A `backdrop-filter` makes an element the containing block for fixed-position
  children. If a glass slot breaks a menu's position, move the slot to a wrapper or use
  role `blur` on a parent.
