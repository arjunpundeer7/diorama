# Writing a skin

A theme draws the background. A skin is what lets it show through one particular app,
by making that app's surfaces transparent or frosted. Every app needs its own skin, and
apps change their markup, so skins are where most maintenance happens.

## Format

```json
{
  "$schema": "../schemas/skin.schema.json",
  "id": "codex-desktop",
  "name": "Codex desktop app",
  "match": {
    "urls": ["app://-/index.html*"],
    "exclude": ["*initialRoute=*"]
  },
  "scheme": {
    "dark": ["html[data-theme=\"dark\"]"],
    "light": ["html[data-theme=\"light\"]"]
  },
  "slots": [
    { "name": "app", "role": "clear", "required": true, "selectors": ["#root"] },
    { "name": "main", "role": "glass", "required": true, "selectors": ["main[data-app-shell-main-surface]"] },
    { "name": "composer", "role": "strong", "selectors": ["[data-composer-body]"] }
  ],
  "status": "draft"
}
```

- **match.urls** picks the pages the skin applies to (`*` matches anything).
  **match.exclude** skips pages that match anyway. Codex, for example, opens transparent
  overlay windows on the same URL, and those must stay transparent.
- **scheme** tells light from dark. Without a match, the app's text colour decides:
  light text means a dark interface.
- **vars** overrides the app's own CSS custom properties. Use this first when the app has
  design tokens: one token covers every element that uses it, including ones that don't
  exist yet. `scope` lists the elements those variables are defined on (`:root` means
  `<html>`). See `skins/claude-web.json` (`--cds-surface-*`) and `skins/vscode.json`
  (`--vscode-*`). Values can use the palette: `var(--diorama-glass)`, `var(--diorama-glass-strong)`.
- **slots** target elements directly, each with a role:

| Role | Effect |
| --- | --- |
| `clear` | Transparent background |
| `glass` | Frosted panel: `--diorama-glass` fill plus backdrop blur |
| `strong` | More opaque glass for menus, popovers and inputs |
| `blur` | Backdrop blur only; the colour comes from the app or from `vars` |

  `required: true` marks the slots without which the skin is broken. Reports flag a
  required slot that matches nothing, which is the usual sign that the app changed.
- **stylesheet** is an optional CSS file next to the JSON, for anything else. Prefix
  every rule with `html.diorama-on`.
- **extends** builds on another skin (Cursor extends VS Code). The parent's slots come
  first; vars merge by name.

Every generated rule is scoped to `html.diorama-on` and marked `!important`, so it wins
over the app's styles and inline styles, and disappears when the theme is turned off.

## Choosing selectors

Prefer, in this order:

1. design tokens, through `vars`;
2. attributes the app uses for itself: `data-testid`, `data-*` state, ARIA roles, ids;
3. semantic class names (`.part.sidebar`, `.bg-surface-1`);
4. never hashed or atomic class names (`_MainContentSurface_azz1c_2`, `x108lcm5`).
   They change on every release.

## The inspector

You don't have to read an app's markup to start. Mount the theme, then ask what is
still hiding the background:

```sh
diorama launch codex --user-data-dir /tmp/diorama-skin --report --inspect
```

```
+ app://-/index.html
    skin codex-desktop / theme lagoon / light / renderer running
    slots: app 1  main 0  composer 1
    missing required slots: main

Still hiding the background on app://-/index.html
  56%  936x773  main.outline-none   rgb(255, 255, 255)
  5%   736x98   div.gap-2 > div     rgb(255, 255, 255)
```

The inspector samples a grid of points and reports, for each one, the topmost element
that paints an opaque colour or an image, including `::before` and `::after` layers.
The percentage is the share of the window it covers. In the browser extension, the
popup's **Find what still hides the background** button does the same.

It does not see box-shadows or layers that are only partly transparent. When the
report is empty but something still looks washed out, check those in DevTools.

## Status

| Status | Meaning |
| --- | --- |
| `verified` | Checked on the app version in `verified`, in the views people use |
| `unverified` | Written from limited access, such as a signed-out page |
| `draft` | Works where tested, not yet reviewed |

Add an entry to `verified` whenever you check a skin against a new app version.
