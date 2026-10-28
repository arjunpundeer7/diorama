# Security

diorama puts code inside apps where you are signed in, so the design assumes a theme
may be hostile, and keeps changes to the apps small and reversible.

## Theme code is sandboxed

Scenes run in an `<iframe sandbox="allow-scripts">`: an opaque origin with no access to
the app's DOM, storage, cookies or JavaScript. The renderer page's Content Security
Policy blocks network access (`default-src 'none'`), so a scene cannot send anything
anywhere. Only the runtime runs in the app page, and it is part of this repository,
not of any theme.

Where a target loads the scene:

| Target | Frame origin | Frame CSP |
| --- | --- | --- |
| Browser extension | manifest `sandbox` page (opaque) | from the manifest: no network |
| VS Code-family patch | sandboxed `vscode-file:` page (opaque) | hash-only scripts, no network |
| `diorama launch` | sandboxed empty frame (opaque) | inherits the app page's policy |

Under `diorama launch`, the frame inherits the app's own policy, which may allow requests
to the app's servers. Opaque-origin requests carry no same-site cookies and their
responses are unreadable without CORS, but it is a weaker fence than the other two.

## The DevTools port

`diorama launch` starts the app with `--remote-debugging-port`, bound to 127.0.0.1 on a
random free port. While the app runs, any program on your machine that finds the port
can control that app's windows, including your signed-in session. Programs running as
you can usually do equally bad things by other means, but treat it as a real exposure:
quit the app when you're done with a launched session.

Apps that refuse a DevTools port (Claude Desktop does) are not worked around.

## What gets modified

| Command | Changes | Undo |
| --- | --- | --- |
| `diorama apply <theme> <editor>` | `workbench.html` (a marked block), `product.json` (one checksum), a `diorama/` folder next to `workbench.html` | `diorama restore <editor>`, the editor extension's **Remove Theme**, uninstalling the extension, or an editor update |
| `diorama apply <theme> windows-terminal` | one key in `profiles.defaults` | `diorama restore windows-terminal` (puts back any shader you had) |
| `diorama apply <theme> ghostty` | a marked block at the end of the config | `diorama restore ghostty` |
| `diorama launch` | nothing on disk | quit the app |

Originals of patched editor files are also copied once to `~/.diorama/backups/` before the
first change.

## Reporting

Please report security problems privately, as described in [SECURITY.md](../SECURITY.md).
