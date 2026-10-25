# Shaderverse v1.0 implementation plan

**Companion to:** the [Shaderverse design docs](README.md), especially [UI](ui.md),
[Knobs and state](knobs-and-state.md), [Architecture](architecture.md),
[Roadmap](roadmap.md) and the [Decision log](decisions.md)\
**Scope:** v1.0 only: a local browser app, with no backend, accounts or
AI\
**Status:** Implemented; acceptance checks in progress (Firefox and Safari not yet verified)

------------------------------------------------------------------------

## 1. Goal

Build a Shadertoy-style shader instrument seen from inside a spherical
cockpit. The user edits GLSL, watches it run live in the central portal,
and turns any numeric constant inside `mainImage` into a knob that
adjusts the shader in real time without recompiling.

v1.0 is done when every item in the acceptance checklist (section 6)
passes.

------------------------------------------------------------------------

## 2. Approach

-   **Pure core first, then rendering, then interaction.** The riskiest
    logic (wrapping and compiling shaders, analyzing and rewriting
    source) is plain TypeScript that can be tested without a screen.
-   **Every milestone ends with something that runs.** No milestone
    leaves the app in a broken state.
-   **Build flat, then curve.** Panel curvature is a geometry parameter,
    so panels start nearly flat and the curve is increased once
    everything works.
-   **Tune by eye with a dev panel.** Sphere radius, eye position, field
    of view and layout are exposed in a development-only tuning panel
    and then written into a config file.
-   **Keep the v1.1 seams.** All changes go through store actions, and
    the compile validator and source analysis can be called without the
    interface, so the v1.1 agent can use them directly.

------------------------------------------------------------------------

## 3. Stack and project layout

### Dependencies

| Purpose | Choice |
|---|---|
| Language and build | TypeScript (strict), Vite |
| 3D | Three.js |
| State | Zustand (vanilla store) |
| Editor overlay | CodeMirror 6, with a GLSL or C-like language mode (evaluated in M4) |
| Unit tests | Vitest |
| Browser tests | Playwright (real WebGL in Chromium) |
| Dev tuning panel | lil-gui (development builds only) |
| Lint and format | ESLint, Prettier |

### Proposed layout

    shaderverse/
      index.html
      src/
        main.ts          app startup
        shader/          wrapper, compile validator, error parsing, runtime
        source/          tokenizer, mainImage locator, literal checks,
                         signature rewrites, reconciliation
        project/         store, actions, action log, schema, persistence
        cockpit/         sphere, camera, lighting, layout config
        panels/          panel system, portal, code display, status
        knobs/           knob objects and interaction
        overlays/        editor overlay, knob popover
        dev/             tuning panel (development only)
      examples/          starter shaders
      tests/
        unit/
        browser/

------------------------------------------------------------------------

## 4. Milestones

Relative size: **S** small, **M** medium, **L** large.

| Milestone | Size | Depends on |
|---|---|---|
| M0 Repo and scaffold | S | --- |
| M1 Shader core | M | M0 |
| M2 Project store and persistence | M | M1 |
| M3 Cockpit and panel system | L | M1 (can overlap M2) |
| M4 Code display and editor overlay | L | M2, M3 |
| M5 Knobs | L | M4 |
| M6 Polish and hardening | M | M5 |

### M0: Repo and scaffold (S)

Tasks:

-   Set up a Vite and TypeScript app with strict type checking.
-   Configure ESLint, Prettier, Vitest and Playwright.
-   Add `.gitignore` and a README with setup and run instructions.
-   Make the first commit, including the design document and this plan.

Done when: the dev server shows a Three.js canvas, and the unit and
browser test commands run (with placeholder tests).

### M1: Shader core (M)

No visible interface beyond a test page.

Tasks:

-   **Shader contract.** Shadertoy `mainImage(out vec4 fragColor, in vec2
    fragCoord)`, plus knob parameters after `fragCoord`. Supported
    uniforms: `iTime`, `iTimeDelta`, `iFrame`, `iResolution`, `iMouse`,
    `iDate`.
-   **Wrapper generator.** Input: user source and the ordered list of
    knob parameters (name and type). Output: a complete GLSL ES 3.00
    fragment shader made of the version line, precision, standard
    uniforms, one uniform per knob (with a reserved prefix so names
    cannot collide with user code), a `#line` directive so error line
    numbers match the user's source, the user's source, and a `main()`
    that calls `mainImage` with the knob uniforms in signature order.
-   **Compile validator.** Compiles and links the wrapped shader against
    a WebGL2 context and returns success or a list of structured errors.
    Callable without any interface.
-   **Error parser.** Turns driver info logs into line and message
    pairs. Covers the formats of Chrome, Firefox and Safari; lines it
    cannot parse are kept as general errors.
-   **Shader runtime.** Square render target with a quality scale;
    full-screen quad with a raw shader material; uniforms updated every
    frame; swaps to a new program only after it compiles, otherwise
    keeps the last good one; play, pause, restart; mouse input API.

Tests:

-   Unit: wrapper output and line mapping; error parser against sample
    logs collected from each browser.
-   Browser: known-good shaders compile; known-bad shaders report the
    expected user line numbers.

Done when: a test page renders a hard-coded shader on a flat plane, and
breaking the shader reports the right line while the previous shader
keeps running.

### M2: Project store and persistence (M)

Tasks:

-   **Store shape:** source, knobs, playback, and UI state (for example
    whether the editor overlay is open).
-   **Actions:** set source; create, rename, update and delete knob; set
    knob value; set playback; open and close editor. Every action is
    serializable.
-   **Action log:** each action with actor (`user` for now) and
    timestamp.
-   **Project schema v1:** version field, source, knob metadata (with
    the reserved fields from [Knobs and state](knobs-and-state.md)), playback settings,
    timestamps, and a migration hook for future versions.
-   **Persistence:** debounced autosave to browser storage behind a
    load/save interface; JSON import and export.
-   **Starter examples:** three to five shaders chosen to show off knobs
    (for example rings, a tiling pattern, a noise field), plus "new from
    example".
-   Connect the store to the M1 runtime: source changes trigger a
    compile; knob values feed uniforms.

Tests:

-   Unit: each action; schema round trip; the migration hook with a
    dummy version.

Done when: the store drives the runtime, and a page reload restores the
project.

### M3: Cockpit and panel system (L)

Tasks:

-   **Scene:** sphere interior with a dark material; fixed camera near
    the wall with tunable radius, eye distance, field of view and look
    direction; minimal lighting.
-   **Dev tuning panel:** live controls for the camera and layout,
    saved into a layout config once tuned.
-   **Panel system:**
    -   Panel surface: pixel size, drawing callback, texture.
    -   Sphere-patch geometry: center direction, angular width and
        height, radius; nearly flat when the radius is very large.
    -   Pointer adapter: raycast to texture coordinate to panel pixels,
        for pointer down, move, up, wheel and hover.
    -   Focus routing: one keyboard target at a time.
    -   Screen-bounds helper: projects a panel's corners to a screen
        rectangle, for placing overlays.
-   **Portal panel:** shows the shader render target through a circular
    mask, with placeholder rim geometry. Pointer input becomes `iMouse`.
-   **Status panel:** compile status, frame rate, time, play, pause,
    restart, quality setting.
-   **First layout pass:** portal in the center, code display to one
    side, status nearby, empty knob slots in a ring around the portal.
-   **Resizing:** canvas size and device pixel ratio.

Tests:

-   Unit: sphere-patch math; texture-coordinate to pixel mapping.
-   Browser: a click at a known screen point maps to the expected panel
    pixel, both flat and curved.

Done when: in the fixed view, the shader plays on the curved portal,
mouse input reaches the shader, the status panel works, and curvature
can be adjusted live.

### M4: Code display and editor overlay (L)

Tasks:

-   **Tokenizer:** GLSL comments, preprocessor lines, numeric literals
    (including forms like `.5`, `5.`, `1e-3`, and integer and unsigned
    suffixes), identifiers, keywords and punctuation. Shared by
    highlighting and by M5's analysis.
-   **Code display panel:** draws the source with syntax highlighting,
    line numbers, error markers and messages, and tinted knob
    parameters; scrolls on hover; waits for fonts; high-resolution
    texture with mipmaps and anisotropic filtering; redraws only when
    something changes.
-   **Legibility pass early in the milestone:** tune font size, texture
    resolution and panel size before building the rest.
-   **Editor overlay:** CodeMirror 6 with highlighting and a dark theme
    matching the cockpit. Opens when the code display is clicked;
    positioned over the code display's screen bounds without covering
    the portal; closes on Escape or a click outside; scroll position
    syncs back to the display.
-   **Live compile loop:** edits update the source (debounced), which
    compiles; success swaps the program, failure shows errors as editor
    diagnostics and on the code display.
-   **Keyboard focus:** while the overlay is open, keys go to the
    editor, and global shortcuts are suspended.

Tests:

-   Unit: tokenizer cases.
-   Browser: typing in the overlay changes the portal output; an error
    appears on the right line.

Done when: the user can click the code display, edit, see live results
and errors, close the editor, and see the updated code on the curved
display.

### M5: Knobs (L)

Tasks:

-   **Locate `mainImage`:** find the signature, parameter list and body
    while tolerating whitespace, comments, qualifiers (`in`, precision
    qualifiers) and line breaks. If `mainImage` is missing, defined more
    than once or defined through macros, the shader still runs but knob
    creation is disabled.
-   **Literal eligibility:** the selection (or the caret) resolves to
    one numeric literal, optionally with a selected unary minus; it is
    inside the `mainImage` body; it is not in a constant-required
    context (`const` initializer, array size, `case` label,
    preprocessor line); it is a `float` or `int` (unsigned literals are
    declined in v1.0). Ineligible selections get a short explanation.
-   **Name proposal:** derived from context where possible (for example
    the variable being assigned or the function being called), otherwise
    `knob1`, `knob2` and so on; always a valid identifier that does not
    collide with existing identifiers, keywords or built-ins.
-   **Create knob:** one undoable editor change that replaces the
    literal with the name and appends the parameter to the signature.
    Metadata: value and default equal to the literal; a starting range
    heuristic (positive values: 0 to twice the value; negative values:
    twice the value to 0; zero: −1 to 1; integers step by 1); the next
    free slot. If no slot is free, decline with a message.
-   **Reconciliation:** after each source change, compare the signature
    with the knob list; add, remove or keep knobs; keep removed knobs'
    metadata for the session so undo restores them.
-   **Rename:** updates the signature and every use inside the
    `mainImage` body.
-   **Delete (bake):** replaces uses with the current value and removes
    the parameter.
-   **Knob objects:** 3D knob geometry with a value indicator and ring,
    label and value text, hover and active states, and a tint that
    matches the code display.
-   **Knob interaction:** vertical drag maps distance to a fraction of
    the range; a modifier key gives fine control; double-click resets.
    Values go to the store and on to uniforms only.
-   **Knob popover:** edit label, minimum, maximum and step; rename;
    delete.
-   **Creation in the editor:** a small "create knob" button by an
    eligible selection, plus a keyboard shortcut.
-   **Bake and export:** export the shader as `.glsl` with all knobs
    baked into the standard signature.

Tests:

-   Unit: signature parsing variants; eligible and ineligible literal
    cases; rewrite output; reconciliation; rename; bake.
-   Browser: rewritten shaders compile; dragging a knob changes the
    image while a compile counter stays unchanged; undo after creating
    a knob restores the original code and removes the knob.

Done when: a pasted Shadertoy shader can be given knobs that work
smoothly, and the whole create, turn, edit, rename and delete loop
behaves as designed.

### M6: Polish and hardening (M)

Tasks:

-   **Look pass:** materials, portal rim, panel bezels and small
    emissive details, within a deliberately limited budget.
-   **Startup sequence:** a brief "SHADERVERSE / GENERATIVE FIELD
    SYNTHESIS SYSTEM / UNIT C/7a / SYSTEM INITIALIZING".
-   **Robustness:** pause when the tab is hidden; recover from a lost
    WebGL context; a clear message when WebGL2 is unavailable.
-   **Example switcher** and a short list of keyboard shortcuts.
-   **Browser check:** current Chrome, Firefox and Safari.
-   **Performance check:** the cockpit itself stays cheap; simple
    shaders run at 60 fps on a laptop with integrated graphics.
-   **README:** how to run, the shader contract, and how knobs work.

Done when: the acceptance checklist passes.

------------------------------------------------------------------------

## 5. Testing strategy

-   **Unit tests (Vitest):** source analysis, wrapper generation, error
    parsing, store actions, schema. These are pure functions on text and
    data, and they carry most of the edge cases, so they get the most
    coverage.
-   **Browser tests (Playwright, Chromium):** real compiles and line
    mapping, panel picking, end-to-end editing and knob flows, and a
    screenshot smoke test of the cockpit.
-   **Manual checks:** text legibility, how knobs feel, curvature, and
    spot checks in Firefox and Safari.

------------------------------------------------------------------------

## 6. v1.0 acceptance checklist

-   [ ] A single-pass Shadertoy shader with no texture channels runs
    when pasted in.
-   [ ] Typing updates the portal within a fraction of a second.
-   [ ] Compile errors appear on the correct lines, in the editor and on
    the code display, while the last good shader keeps running.
-   [ ] A literal inside `mainImage` becomes a knob in a few seconds,
    and the image does not change at creation.
-   [ ] Turning a knob is smooth and causes no recompile.
-   [ ] Ineligible literals are declined with a clear explanation.
-   [ ] Rename, range editing and delete (bake) work; undo restores
    knobs.
-   [ ] Everything fits in one fixed view; the curvature is subtle but
    noticeable; the code is legible on the curved display.
-   [ ] The editor overlay never covers the portal.
-   [ ] Reloading restores the project; export followed by import gives
    back the same project; baked `.glsl` export runs as a standard
    Shadertoy shader.
-   [ ] Works in current Chrome, Firefox and Safari.

------------------------------------------------------------------------

## 7. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Code is hard to read on the curved display | Legibility pass at the start of M4; high-resolution texture with mipmaps; the overlay is always available for real reading |
| Driver error log formats differ | Collect sample logs from each browser in M1; keep unparseable lines as general errors |
| Edge cases in literal detection and signature parsing | Purpose-built tokenizer; extensive unit tests; decline anything ambiguous rather than guess |
| The overlay does not line up with the curved panel | The camera is fixed, so the bounds are stable; design the overlay as "lifting forward" so exact alignment is not needed |
| A heavy or broken shader stalls the GPU | Quality scale, pause, context-loss recovery; document as a known limit |
| Cockpit look absorbs all the time | Look work is limited to M6; placeholder geometry until then |

------------------------------------------------------------------------

## 8. Seams kept for v1.1

These need no extra work in v1.0, only discipline:

-   Store actions are serializable and record an actor, so an agent can
    use them and its changes show up in the log.
-   The compile validator runs without the interface, for the agent's
    repair loop.
-   Source analysis (locating `mainImage`, literal eligibility,
    signature rewrites) is reusable by the agent.
-   The project schema reserves fields for explanations, learning
    context and concept tags.

------------------------------------------------------------------------

## 9. Settled during v1.0

-   Number and arrangement of knob slots (M3 and M5).
-   Final range heuristic, after trying it on the starter examples (M5).
-   Code display font, size and texture resolution (M4).
-   Final camera and sphere values (M3).
-   Which starter examples ship (M2).
