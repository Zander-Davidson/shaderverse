# Spatial interface: the spherical cockpit

*Part of the [Shaderverse design docs](README.md).*

The interface is a real-time 3D scene rendered with Three.js, not a
static background with HTML controls arranged over it. The user's point
of view is from inside a spherical cockpit.

## Cockpit geometry

-   The cockpit is the interior of a large sphere.
-   The camera sits inside the sphere, close to its wall, facing the
    nearby inner surface. Because the sphere is large and the eye is
    near the wall, the surface in view has a subtle but noticeable
    curvature: rows of code and the edges of displays bow gently, as if
    seen on the inside of a dome.
-   Displays and controls are mounted on, or just off, that inner
    surface. Each display is a patch of a sphere, not a flat rectangle.
-   The curvature comes from real geometry, not from a post-process lens
    effect. This keeps pointer picking exact and leaves room for
    lighting, reflections and canopy detail later.
-   The sphere radius, the eye's distance from the wall and the field of
    view are tunable. Their final values are chosen by eye during
    development.

## Fixed view

In v1.0 the camera does not move. Everything needed (portal, code
display, knobs and status) fits in one composed view, with no panning,
zooming or focus transitions.

If the cockpit becomes crowded in later versions, the camera may pan to
other regions of the sphere to reach other controls or views. The panel
system ([Architecture](architecture.md)) is designed so that this is a camera change, not a
redesign.

## Central shader portal

A large circular display is embedded at the center of the view. It
functions as the main viewport for the active shader.

The portal should feel like a window into a synthetic environment or a
contained visual phenomenon. Its rim can feature layered mechanical
geometry, translucent materials, emissive channels, and intricate
surface details.

The shader itself should be the brightest, most visually compelling
element in the scene.

The shader renders into its own square texture, which the portal shows
through a circular mask, so the shader's coordinate system stays
conventional. Clicking or dragging on the portal is passed to the shader
as mouse input (`iMouse`) in the shader's own pixel coordinates.

The user can continuously observe the result while manipulating
parameters elsewhere in the cockpit.

## Code display and editor overlay

**Code display panel.** A curved, read-only display that always shows
the active shader source with syntax highlighting. Compile errors are
marked on their lines. Knob parameters are tinted in the same color as
their knobs, so the link between a control and its code is visible at a
glance. The panel scrolls with the mouse wheel when hovered.

**Editor overlay.** Clicking the code display opens a flat, conventional
code editor window over the scene: syntax highlighting, error markers,
undo, and normal keyboard behavior. It appears over the code display's
region of the screen, so it reads as the panel lifting forward. It must
not cover the portal, so the shader keeps visibly updating while the
user types. Pressing Escape or clicking outside closes it, and the
curved display then shows the updated code.

Knobs are created from the editor overlay ([Knobs and state](knobs-and-state.md)).

A fully in-scene, curved editor with its own text rendering remains a
possible later upgrade. The overlay is the v1.0 decision.

## Knobs

The most important parameters appear as physical-feeling controls
surrounding the portal.

In v1.0:

-   Knobs are 3D objects mounted on the cockpit surface around the
    portal, in a fixed set of slots (a ring of roughly eight; the count
    is settled during layout).
-   Each knob shows its label and current value.
-   Dragging vertically changes the value. Holding a modifier key gives
    fine control. Double-clicking resets to the default.
-   Turning a knob updates a shader uniform only. It never triggers a
    recompile.
-   The label, range and step are edited in a small flat popover
    anchored to the knob.

Later control forms can include:

-   Rotary dials with illuminated rings.
-   Sliders embedded in curved tracks.
-   Small physical-style switches.
-   Pressure-sensitive or stepped controls.
-   Oscillating indicators and animated readouts.
-   Linked controls that visually suggest mathematical relationships.

The controls should be visually distinct enough to understand at a
glance, while sharing a coherent design language.

Whenever possible, a parameter should have an immediate, visible effect
on the shader.

## Status readouts

A small display shows compile status, frame rate and playback time, with
play, pause and restart controls and a render-quality setting.

## Mathematical readout (v1.2 and later)

A contextual mathematical display provides a deeper view into the active
parameter or operation.

It can reveal:

-   A plain-language explanation.
-   The mathematical expression.
-   Definitions of individual terms.
-   The corresponding GLSL expression.
-   Related concepts and suggested experiments.

This display is part of the same cockpit. It should feel like the
machine is exposing its internal operating principles, not opening a
separate textbook.

## AI companion (v1.1 and later)

The AI is represented by an abstract, luminous orb or other simple,
nonthreatening visual presence.

It should feel like an intelligence inhabiting the instrument: calm,
attentive, and capable. Its visual behavior can communicate whether it
is listening, reasoning, synthesizing, or reporting a problem.

The AI can communicate through short contextual messages, a focused
interaction area, and subtle animation. Avoid making a conventional chat
window the primary interface. Prompt entry follows the overlay principle:
a flat input appears when the user addresses the AI.

## Peripheral systems

Additional displays and controls can represent shader diagnostics,
parameter relationships, MIDI assignments, runtime status, and other
technical subsystems.

These elements should be added where they reinforce the experience or
provide real utility. The cockpit should feel richly inhabited without
becoming a random collection of decorative widgets.

## Reference interfaces

Four existing interfaces capture parts of what the cockpit should feel
like. Each one is listed with what to take from it and the future
features it suggests. None of these features is scheduled yet (see
[Roadmap](roadmap.md)).

### Fallout Pip-Boy

A green phosphor screen set into a worn, physical wrist device, with
real knobs, dials and a radiation gauge around the glass. The player's
own fingers are in frame, turning the knobs that drive the screen.

-   **Take:** full skeuomorphism. Controls look like objects that were
    manufactured, used and worn, and the display is a screen inside a
    housing rather than a floating panel. The menu is navigated by
    turning physical controls, not by clicking flat buttons.
-   **Future features:** rendered hands or fingers that reach in to
    turn a knob or press a button when the user interacts with it;
    weathering, scratches and grime on control housings; analog gauges
    (needle meters, like the rads dial) as readouts alongside digital
    ones.

### Call of Duty: Black Ops main menu

The menu is not a screen but a room. The player is strapped into a
chair in a dark interrogation space; the menu is text on an old CRT, and
the camera drifts and tilts as if the player is looking around. Other
monitors, equipment and people are visible in the background.

-   **Take:** the menu is already inside the story. Background objects
    and figures raise questions (where am I, who else is here) without
    answering them, so the interface carries a narrative before the
    user does anything.
-   **Future features:** a slow, subtle idle camera sway or look-around
    (head movement, not navigation); background detail beyond the
    cockpit wall or through gaps in it, such as other machines, distant
    lights or silhouettes, that hint at a larger world; CRT effects
    (scanlines, color bars, signal noise) on secondary displays.

### The Matrix: the Nebuchadnezzar control room

A tangle of mismatched monitors and keyboards hanging from the ceiling
on mechanical arms around an operator's chair, with exposed wiring,
cable bundles and greebles everywhere. Green code rain on most screens.

-   **Take:** a jury-rigged, accumulated feel. The hardware looks
    salvaged and modified over time, not designed as a set. Many small
    screens, each with its own job, are arranged around the operator.
-   **Future features:** auxiliary displays mounted on articulated arms
    that can swing into view when needed (a physical form for the camera
    and panel changes described under [Fixed view](#fixed-view));
    visible cables and conduits running between displays and controls;
    greeble density around the portal rim and panel mounts; mismatched
    bezels and screen sizes across peripheral displays.

### 2001: A Space Odyssey: the EVA pod

The inside of a pod bathed in red light. A single circular porthole is
the center of the composition, surrounded by small square screens,
backlit buttons and indicator rows, all mounted on curved walls.

-   **Take:** the composition the cockpit already uses. One circular
    window dominates; everything else is small, dense and arranged
    around it. Colored ambient light floods the whole interior.
-   **Future features:** whole-cockpit lighting moods (for example a red
    alert state on compile failure, or ambient light tinted by the
    shader's own colors spilling out of the portal); banks of small
    backlit push-buttons and indicator lamps as status displays.

### What they have in common

-   The user is *inside* a place, not looking at an app.
-   One focal display, surrounded by dense, physical, purposeful
    clutter.
-   Controls are objects with weight and history.
-   The surroundings imply a larger world that is never fully explained.
