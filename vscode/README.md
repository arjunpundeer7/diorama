# diorama for VS Code, Cursor and Windsurf

Puts an animated background behind the editor and turns its panels into frosted glass.

## Use

1. Command palette: **diorama: Apply Theme**, pick a theme.
2. Reload the window when asked.

**diorama: Remove Theme** undoes it. **diorama: Show Status** says what is applied.

## How it works

The editor has no API for this, so the extension edits the editor's own `workbench.html`
to load the diorama runtime, and updates that file's checksum in `product.json`. Both
changes are undone by **Remove Theme** and when you uninstall the extension.

Editor updates replace `workbench.html`. On the next start the extension notices and
applies the theme again (setting: `diorama.reapplyAfterUpdate`).

The first reload after applying may show "Your installation appears to be corrupt".
That notice compares against checksums the editor loaded before the change; restart
the editor once and it goes away.

The animation runs in a sandboxed frame that cannot reach the editor or your files.

## Settings

| Setting | Default | |
| --- | --- | --- |
| `diorama.theme` | `""` | Theme kept applied. Set by **Apply Theme**. |
| `diorama.style` | `""` | Draw the theme as `ascii`, `braille`, `halftone`, `dither`, `mosaic` or `teletext`. |
| `diorama.options` | `{}` | Theme options to override, e.g. `{ "turtles": 5, "speed": 0.6 }`. |
| `diorama.fps` | `0` | Frame-rate cap; `0` uses the theme's rate. |
| `diorama.reapplyAfterUpdate` | `true` | Re-apply after an editor update. |

## Permissions

If the editor is installed for all users (for example under `C:\Program Files` or
`/usr/share`), its files are not writable by you. Use the per-user installer, or apply
from an administrator shell with the CLI: `diorama apply <theme> vscode`.
