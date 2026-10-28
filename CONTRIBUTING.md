# Contributing

```sh
git clone https://github.com/arjunpundeer7/diorama && cd diorama
npm install
npm test
node bin/diorama.js preview
```

There's no build step. `runtime/*.js` is injected as written, and the CLI runs straight
from `src/`.

## Good first contributions

**Themes.** Start from an existing one with `diorama new theme mine --from lagoon --dir themes`,
then follow [docs/themes.md](docs/themes.md). A new theme needs a light and a dark
palette, a reduced-motion frame that looks deliberate, and a `preview.png`
(`diorama preview --write-previews`). Shaders for the terminals are welcome but optional.

**Skins.** Apps change their markup, so skins drift. Run

```sh
diorama launch <app> --user-data-dir /tmp/diorama-skin --report --inspect --screenshot out.png
```

fix what the report and inspector show, and add a `verified` entry with the app version.
Include before and after screenshots, and check they don't show your own chats or files.
See [docs/skins.md](docs/skins.md).

**Apps.** Add the app to `src/cli/apps.js` with a skin. If an app refuses a DevTools port
or otherwise blocks this, don't work around it: list it as `blocked` with the reason.

## Ground rules

- Theme code runs only in the sandboxed renderer frame. The runtime never loads or runs
  anything a theme ships.
- Everything `diorama apply` changes, `diorama restore` must undo, byte for byte where the file
  format allows. Add a test.
- The runtime has no dependencies and avoids `innerHTML`, `srcdoc` and `eval`; editors
  enforce Trusted Types.
- Skins use the app's stable hooks (tokens, `data-*`, roles), never generated class names.
- Keep code free of comments. Clear names and small functions carry the meaning; anything
  that needs explaining goes in the docs or the pull request.

## Tests

`npm test` runs `test/*.test.js` with `node:test`. Editor patching and the terminal
installers run against fixture files in a temp folder; nothing touches real installs.
