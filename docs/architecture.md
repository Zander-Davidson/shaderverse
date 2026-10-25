# Technical direction

*Part of the [Shaderverse design docs](README.md).*

## Foundation (v1.0)

-   **TypeScript and Vite:** Language and build. v1.0 is a static,
    local browser app with no backend.
-   **Three.js, without React:** The cockpit scene, panels, knobs and
    the shader's render target. The interface is a single bespoke 3D
    scene with custom render passes and high-frequency updates, and
    there is no DOM interface tree for React to manage. React Three
    Fiber can be reconsidered if composing the scene becomes unwieldy.
-   **Zustand (vanilla, without React bindings):** The project store.
-   **CodeMirror 6:** The flat editor overlay.
-   **WebGL2 and GLSL ES 3.00:** Shader execution.
-   **Canvas 2D:** Draws the code display panel's texture.
-   **Browser storage (IndexedDB or localStorage):** Autosave.
-   **Later:** Web MIDI API, and AI services from v1.1. How API keys are
    handled (a thin backend proxy or a user-supplied key) is decided in
    v1.1.

## Module boundaries

| Module | Responsibility |
|---|---|
| Shader core | Wrapper generation, compile validation, error parsing |
| Shader runtime | Render target, uniforms, last-good program, playback |
| Source analysis | Tokenizing, locating `mainImage`, literal and scope checks, signature rewrites, reconciliation |
| Project store | State, actions, action log, schema, persistence |
| Cockpit scene | Sphere, camera, lighting, layout |
| Panel system | Curved display surfaces and pointer mapping |
| Panels | Portal, code display, status |
| Knobs | 3D knob objects and their interaction |
| Overlays | Editor overlay, knob popover |

Rules:

-   Source analysis is pure text logic with no Three.js or DOM
    dependency. Shader core is pure apart from needing a WebGL context
    to compile.
-   The scene and overlays read the store and dispatch actions. They do
    not own authoritative values.
-   The v1.1 agent will use the same store actions, the same compile
    validator and the same source-analysis functions as the user
    interface.

## Panel system

Every display in the cockpit is a panel:

1.  A flat 2D surface with its own pixel coordinates, which the panel
    draws into.
2.  A texture holding that drawing.
3.  A mesh the texture is mapped onto: a patch of a sphere.
4.  A pointer adapter. A raycast against the mesh returns a texture
    coordinate, which the adapter converts into the panel's pixel
    coordinates and passes to the panel's handler.

Panels do not know they are curved. Curvature is a property of the mesh,
so development can start with nearly flat panels and increase the
curvature later without changing panel code. Picking stays exact at any
curvature because it goes through the mesh, not screen space.

One target has keyboard focus at a time (the editor overlay, a knob
popover, or the cockpit itself). Global shortcuts such as pause are
disabled while the user is typing in an overlay.

## Rendering architecture

-   One WebGL renderer and one render loop.
-   **The shader** renders every frame into a square render target whose
    resolution is independent of the portal's size on screen, controlled
    by a quality setting. It uses a raw shader material, so the app
    controls the complete source with no prelude added by Three.js.
-   **The wrapper** consists of the version line, precision, Shadertoy
    uniforms and knob uniforms, then a `#line` directive so that compile
    errors refer to the user's own line numbers, then the user's source,
    then `main()`.
-   **Compile validation:** after typing pauses briefly (debounced), the
    wrapped source is compiled directly against the WebGL context and
    the info log is parsed into structured errors (line and message).
    If compilation fails, the last good program keeps rendering and the
    errors are shown.
-   **Shadertoy uniforms supported in v1.0:** `iTime`, `iTimeDelta`,
    `iFrame`, `iResolution`, `iMouse` and `iDate`. Not supported in
    v1.0: texture channels (`iChannel0` to `iChannel3`), multipass
    buffers, audio and cubemaps.
-   **The code display** texture is redrawn only when the source, errors
    or scroll position change. Fonts are loaded before drawing. The
    texture is high resolution with mipmaps and anisotropic filtering so
    that text stays legible on the curved, angled surface.
-   **The cockpit** renders every frame with deliberately simple
    lighting in v1.0.
-   **Performance:** the shader shares the GPU with the cockpit, so the
    quality setting matters. Rendering pauses when the tab is hidden,
    and a lost WebGL context is restored and recompiled. Known limit: a
    shader with a runaway loop can stall the GPU, and the browser may
    reset the context. Pause and low quality are the mitigations.

## Overlays

Overlays are DOM elements above the 3D canvas. They are positioned using
the projected screen bounds of the panel or knob they belong to, which
is straightforward because the camera is fixed. They are styled to match
the machine, but legibility comes first.

## State architecture

Maintain a central state model for the active shader, its parameters,
mappings, and associated learning information.

The 3D scene presents that state. It does not own the authoritative
values.

This distinction is especially important as the application grows: the
same parameter must remain consistent across virtual dials, MIDI
controls, shader uniforms, mathematical explanations, and AI operations.

## Persistence

-   The current project is saved automatically in the browser.
-   Projects can be exported and imported as JSON files.
-   A shader can be exported as a plain `.glsl` file with its knobs
    baked.
-   A few starter example shaders are bundled with the app.
-   Storage sits behind a small load/save interface, so v2.0 can replace
    the browser implementation with a server-backed one.

## Practical constraints

The most difficult part is likely to be achieving polished, organic 3D
geometry, convincing glossy materials, reflections, and an intentional
composition---not simply rendering a 3D scene in a browser.

Legibility is the other major constraint: code and labels must stay
readable on curved surfaces at a fixed viewing distance.

Start with a controlled visual scope and build up the cockpit's
complexity incrementally.

Prioritize a stable rendering loop and clear interaction semantics
before attempting elaborate effects.
