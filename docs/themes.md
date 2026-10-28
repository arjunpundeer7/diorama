# Writing a theme

A theme is a folder: in this repo's `themes/` if you are contributing it, or in
`~/.diorama/themes/` if it's just for you.

```
lagoon/
  theme.json        name, palette, options
  scene.js          the animation
  preview.png       thumbnail (diorama preview --write-previews makes it)
  terminal/
    windows-terminal.hlsl
    ghostty.glsl
```

The quickest start is to copy one:

```sh
diorama new theme sunrise --from drift
diorama preview sunrise --stage
```

`--stage` hides the demo app so you see only the background. Edit `scene.js`, reload the
page. `diorama preview sunrise --screenshot shot.png` saves a PNG and prints any error the
scene threw.

## theme.json

```json
{
  "$schema": "../../schemas/theme.schema.json",
  "id": "lagoon",
  "name": "Honu Lagoon",
  "version": "1.0.0",
  "tagline": "ASCII lagoon",
  "description": "Sea turtles paddle through a bright lagoon...",
  "scheme": "light",
  "scene": "scene.js",
  "fps": 30,
  "resolution": 1,
  "palette": {
    "light": { "base": "#a9e6ee", "glass": "rgb(255 255 255 / 0.5)", "glassStrong": "rgb(255 255 255 / 0.8)" },
    "dark": { "base": "#082f39", "glass": "rgb(6 30 38 / 0.55)", "glassStrong": "rgb(6 30 38 / 0.84)" }
  },
  "options": { "mark": "ascii", "turtles": 3, "speed": 1 }
}
```

| Field | |
| --- | --- |
| `id` | Lowercase, matches the folder name |
| `tagline` | A few words for cards and lists |
| `scheme` | Which mode previews and screenshots use |
| `fps` | Frame cap. 24 to 30 is plenty for most scenes |
| `resolution` | Canvas resolution relative to device pixels. Soft scenes look the same at `0.5` for a quarter of the work |
| `palette` | Colours for the glass around your scene, per mode |
| `options` | Anything your scene reads from `env.options`. People override these with `--set key=value` |

Palette keys, all CSS values:

| Key | Used for |
| --- | --- |
| `base` | Solid colour behind the canvas, shown before the first frame |
| `glass` | Frosted panels such as sidebars and editors |
| `glassStrong` | Menus, popovers and inputs, which must stay readable |
| `blur` | Backdrop blur radius, default `18px` |
| `scrim` | A layer over the animation to calm it under text |
| `border`, `accent`, `text` | Available to skins as `var(--diorama-border)` and so on |

## The scene

`scene.js` runs in a sandboxed frame with a full-window canvas:

```js
diorama.scene({
  setup(env) {},
  resize(env) {},
  frame({ t, dt, frame }, env) {},
  scheme(env) {},
});
```

- `setup` runs once, `resize` after the canvas changes size, `scheme` when the app
  switches between light and dark.
- `frame` gets the time in seconds, the seconds since the last frame and a counter.
- `env` holds `canvas`, `width` and `height` (CSS pixels), `dpr` (canvas pixels per CSS
  pixel), `scheme`, `palette`, `options` and `reducedMotion`.

The renderer caps the frame rate, stops while the window is hidden or paused, and draws a
single frame when someone prefers reduced motion. Make that frame look intentional.

## The cell engine

The bundled themes don't draw marks themselves. They paint a small picture where one
pixel is one cell, and the engine turns every cell into a mark. That's why any theme can
switch between ASCII, braille, halftone, dither, mosaic and teletext.

```js
let g;

diorama.scene({
  setup(env) {
    g = diorama.grid({ mark: env.options.mark || 'ascii', cell: 14 }).resize(env);
  },
  resize(env) {
    g.resize(env);
  },
  frame({ t }, env) {
    const ctx = env.canvas.getContext('2d');
    ctx.fillStyle = '#0b1f2a';
    ctx.fillRect(0, 0, env.canvas.width, env.canvas.height);

    const c = g.begin();
    c.fillStyle = '#ffb347';
    c.beginPath();
    c.arc(g.cols / 2 + Math.sin(t) * 10, g.rows / 2, 6, 0, diorama.TAU);
    c.fill();
    g.draw(ctx, t);
  },
});
```

`g.begin()` clears the cell canvas and returns its 2D context, scaled so one unit is one
cell (`g.cols` by `g.rows`). Draw with any canvas call; colour picks the mark's colour and
alpha its strength. `g.draw(ctx, t)` renders the marks onto the real canvas. Paint your
full-resolution background first, as above, and the marks land on top.

`diorama.grid` options:

| Option | Default | |
| --- | --- | --- |
| `mark` | `ascii` | `ascii`, `braille`, `halftone`, `dither`, `mosaic`, `teletext` |
| `cell` | `14` | Cell size in CSS pixels |
| `glyphs` | `.:-=+*#%@` | ASCII characters to pick from |
| `glyph(r, g, b, a, col, row, t)` | | Return the character for a cell yourself |
| `flicker` | `0.4` | How often a cell's glyph changes, per second |
| `shade`, `shadeAlpha` | `dark`, `0.5` | Glyph colour over its tile |
| `gap` | `1` | Space between tiles, CSS pixels |
| `threshold` | `0.06` | Cells fainter than this stay empty |
| `size` | `1` | Dot size for braille and halftone |
| `paper`, `ink`, `accent` | | Dither colours. Saturated cells dither in the accent |

What each mark reads from a cell:

| Mark | Reads | Draws |
| --- | --- | --- |
| `ascii` | colour, alpha | a tinted tile with a glyph |
| `halftone` | colour, alpha | a dot whose area follows alpha |
| `braille` | 2x4 samples per cell | up to eight dots |
| `teletext` | 2x3 samples per cell | blocks in the eight teletext colours |
| `mosaic` | colour, alpha | a tile with a little colour jitter |
| `dither` | colour, alpha | ordered 1-bit dither between `paper` and `ink` |

Helpers on `diorama`: `noise(x, y, z)`, `fbm(x, y, z, octaves)`, `hash(a, b, c)`,
`rng(seed)`, `rgb(color)`, `mix(a, b, t)`, `css(color, alpha)`, `lerp`, `clamp`, `smooth`,
`TAU`.

Reading `env.options.mark` when you create the grid, as above, is what makes
`--set mark=braille` work for your theme.

## What a scene cannot do

The frame has an opaque origin and a strict Content Security Policy:

- no access to the app's page, storage or cookies;
- no network at all;
- images must be `data:` URLs to work everywhere, because editors and `diorama launch`
  load the scene inlined into a single page.

## Terminal shaders

Terminals can't show a web page, so a theme can ship shaders that echo its look.

- **Windows Terminal:** an HLSL pixel shader, `float4 main(float4 pos : SV_POSITION, float2 tex : TEXCOORD) : SV_TARGET`,
  with the terminal in `shaderTexture` and `Time`, `Scale`, `Resolution` and
  `Background` in a constant buffer. Replace pixels that match `Background`; leave text alone.
- **Ghostty:** Shadertoy style, `mainImage(out vec4 fragColor, in vec2 fragCoord)` with the
  terminal in `iChannel0`, plus `iTime` and `iResolution`. There's no background uniform,
  so tell background from text by brightness.

## Before you open a pull request

- `npm test` passes.
- `diorama preview <id>` in both modes looks right, and text over it stays readable.
- Keep CPU low: these run behind apps people use all day. Check frame time in DevTools.
- `diorama preview --write-previews` refreshes `preview.png`.
