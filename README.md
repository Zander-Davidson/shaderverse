# SHADERVERSE

**Generative field synthesis system · Unit C/7a**

A Shadertoy-style shader instrument seen from inside a spherical cockpit. Edit
GLSL, watch it run live in the central portal, and turn any number inside
`mainImage` into a knob that changes the shader in real time without
recompiling.

v1.0 is a local browser app with no backend. The design lives in
[docs/](docs/README.md); the build plan is in
[docs/implementation-plan-v1.0.md](docs/implementation-plan-v1.0.md).

## Run it

### In Docker

```bash
./buildrun.sh
```

This builds the image and serves the app at <http://localhost:8080>. Options:

| Option | Effect |
|---|---|
| `PORT=9000 ./buildrun.sh` | Serve on another port |
| `./buildrun.sh --detach` | Run in the background (`docker stop shaderverse` to stop) |
| `./buildrun.sh --open` | Also open the app in your default browser |

### On GitHub Pages

`.github/workflows/pages.yml` builds the app and publishes it on every push to
`main`. One-time setup: in the repository, open Settings → Pages and set
Source to "GitHub Actions". The site is then served at
`https://<user>.github.io/<repo>/` (the build uses relative paths, so any
subpath works).

### For development

Requires Node 22 or later.

```bash
npm install
npm run dev
```

Then open <http://localhost:5173>. Development builds include a cockpit tuning
panel (top right) for sphere radius, eye distance and layout; "copy config"
prints values to paste into `src/cockpit/layout.ts`.

URL options:

| Option | Effect |
|---|---|
| `?noboot` | Skip the startup sequence |
| `?gfx=low` | Low graphics for weak or software GPUs: no chrome backdrop, area lights, clearcoat or iridescence, and pixel ratio 1 |
| `?editor=overlay` | Edit in the flat overlay window instead of on the curved panel |

| Command | What it does |
|---|---|
| `npm test` | Unit tests (Vitest) |
| `npm run test:browser` | Browser tests (Playwright, real WebGL in Chromium). Run `npx playwright install chromium` once first. |
| `npm run typecheck` | TypeScript, strict |
| `npm run lint` | ESLint |
| `npm run build` | Production build into `dist/` |

## The shader contract

Shaders use the Shadertoy entry point:

```glsl
void mainImage(out vec4 fragColor, in vec2 fragCoord)
```

Available uniforms: `iTime`, `iTimeDelta`, `iFrame`, `iResolution`, `iMouse`
and `iDate`. Single pass only; texture channels, buffers, audio and cubemaps
are not supported in v1.0. A pasted single-pass Shadertoy shader runs as is.

The app wraps your source in a hidden GLSL ES 3.00 shader. Error line numbers
refer to your own code. When an edit fails to compile, the last good shader
keeps running.

## Standard library

Every shader can call a small library of named functions, defined for
`float`, `vec2`, `vec3` and `vec4`. Use them instead of writing the same
arithmetic inline; the examples do.

| Function | Basic form |
|---|---|
| `reciprocal(x)` | f(x) = 1/x |
| `square(x)` | f(x) = x² |
| `gaussian(x)` | f(x) = e^(−x²) |
| `sigmoid(x)` | f(x) = 1 / (1 + e^(−x)) |
| `wave(x)` | f(x) = ½ + ½·cos(x) |
| `triangle(x)` | f(x) = \|2·fract(x) − 1\| |
| `tonemap(x)` | f(x) = 1 − e^(−x) |

Hover a function name in the source (a library function or a common GLSL
built-in such as `sin`, `fract` or `smoothstep`) and the function plot above
the source draws its basic form with its name and formula. A shader that
defines a function of the same name itself keeps its own. Exported `.glsl`
includes the library functions it uses, so it still runs on Shadertoy. The
catalog lives in [src/shader/stdlib.ts](src/shader/stdlib.ts).

## How knobs work

Knobs are extra `float` or `int` parameters of `mainImage`:

```glsl
void mainImage(out vec4 fragColor, in vec2 fragCoord,
               in float ringFreq, in float speed)
```

- **Create.** Click into the code on the curved source panel (it is the
  editor: typing, selection, undo and clipboard all work in place), select a
  number inside `mainImage` — double-click selects a whole literal — and press
  <kbd>⌘K</kbd> / <kbd>Ctrl K</kbd> or the "make knob" chip. The number becomes a named parameter. The knob starts
  at that number, so the image doesn't change, and one undo reverts it.
- **Turn.** Drag a knob vertically. Hold <kbd>Shift</kbd> for fine control,
  and double-click to reset. Turning a knob only updates a uniform; it never
  recompiles.
- **Edit.** Click or right-click a knob to change its label, name, range and
  step. Renaming updates the signature and every use inside `mainImage`.
- **Delete.** "Delete (bake)" replaces the parameter with its current value.
- **Type it yourself.** Any `float` or `int` parameter you add after
  `fragCoord` becomes a knob, because the signature decides which knobs exist.

Numbers that can't become knobs are declined with a reason. These are numbers
in helper functions (which can't see `mainImage` parameters), in `const`
initializers, array sizes, `case` labels, preprocessor lines, and unsigned
literals. There are eight knob slots, in an arc beside the portal; a slot's tube to
the source window glows with flowing fluid while it holds a knob.

## Projects

The current project autosaves in the browser. The library panel can:

- start a new project from one of the examples
- export or import a project as JSON
- export the shader as `.glsl` with every knob baked back to the standard
  signature

## Keyboard

| Key | Action |
|---|---|
| <kbd>Space</kbd> | Play / pause |
| <kbd>R</kbd> | Restart time |
| <kbd>Q</kbd> | Cycle render quality |
| <kbd>E</kbd> / <kbd>Enter</kbd> | Open the editor |
| <kbd>1</kbd>–<kbd>9</kbd> | New project from an example |
| Click the portal | Lean in so the portal and knobs fill the view; click again or <kbd>Esc</kbd> to sit back |
| <kbd>?</kbd> | Show all controls |

## Rendering

The cockpit is mostly still, so it renders into a cached image and only the
screen regions that change (a knob turning, a panel redrawing) are re-rendered.
Each frame draws just the live shader portal, the cached cockpit over it, the
flowing fluid in active knob tubes, and the caret. Camera moves (leaning in and
out) re-render everything while they last. See `src/cockpit/compositor.ts`.

## Layout

```
src/
  shader/     wrapper, compile validator, error parser, runtime
  source/     tokenizer, mainImage locator, literal checks, rewrites, reconciliation
  project/    store, actions and log, schema, persistence
  cockpit/    sphere, camera, layout config, frame compositor
  editor/     editing engine shared by the in-scene and overlay editors
  style/      chrome chassis, LCD screens, liquid-chrome backdrop, quality
  panels/     panel system, pointer picking, portal, code display, status, library
  knobs/      knob objects and interaction
  overlays/   editor, knob popover, boot sequence, help
  dev/        tuning panel (development only)
examples/     starter shaders
tests/        unit/ (Vitest) and browser/ (Playwright)
```

Known limit: a shader with a runaway loop can stall the GPU, and the browser
may reset the graphics context. The app recovers from a lost context; pause
and low quality are the mitigations.
