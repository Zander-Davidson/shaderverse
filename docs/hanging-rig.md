# The hanging rig

*Part of the [Shaderverse design docs](README.md).*

**Status:** built on the `hanging-monitors` branch, with the changes
listed under [As built](#as-built). Scheduled in the
[Roadmap](roadmap.md) as the v1.0.x cockpit rework.

The cockpit opens up. The camera sits further back from the portal,
and the displays and controls stop being set into one molded chrome
console. Instead they hang from the cockpit ceiling on mechanical arms,
between the user and the portal: monitors with convex, CRT-like glass
in chrome bezels, and a hanging control console that holds the knobs.
The portal stays where it is, at the front of the cockpit, the
furthest thing in view.

This takes the "displays on articulated arms" idea from the
Nebuchadnezzar control room in *The Matrix*
([Reference interfaces](ui.md#reference-interfaces)), but keeps it
sleek: precise machined arms and polished chrome bezels, not salvaged
hardware.

## As built

Where the build departs from or settles the design below. Screenshots are
in [screenshots/hanging-rig](screenshots/hanging-rig/README.md).

-   **The window.** The round portal became a wide windscreen across the
    front of the cockpit: the shader is the view outside, rendered in the
    window's shape (the same pixel count per quality as before). Simple
    strut-and-window construction, not the Falcon's rings and spokes: a
    heavy frame and sill, four struts leaning toward an apex above the
    view so the panes taper as they rise, a cross strut over the outer
    panes only, and one diagonal brace on the right. The center pane is
    the widest, its struts set well out past the focal circle, so nothing
    crosses the middle of the view, sitting back or leaned in. A faint haze,
    edge shading and dust make the glass read. `cfg.portal` is now the
    focal circle of that view: what leaning in frames and what the
    companion and the overlay editor keep clear of. The window parallax
    and the portal glow carry over.
-   **Hull.** Plain, dark and matte. The molded collars, seams and the
    circuit tubing that were tried are gone.
-   **Arms.** They hang from an overhead rail that arcs just inside the
    top of the default view (the sphere's ceiling is far above), each on
    a rounded carriage. Joints are round: pivot hubs with chrome caps, a
    lock collar and clamp knob, a round-cheeked yoke and a disc plate.
-   **Monitors.** They hang partway between facing the eye and square to
    the view (`monitorFacing`), so the wide lens stretches them less.
    Convex glass reflects a calm room of its own (a few soft light
    strips), with a faint vignette and scanlines. The readouts lay out
    at 1.6–1.75× for legibility, the library in two columns.
-   **Console.** Two arms, dropping behind the monitor columns. Knob slots
    in the top row with a label and value strip under each. One row below:
    PLAY, RESTART and LOW/MED/HIGH work (and left the status monitor),
    CMP and RUN lamps follow state, the toggles and keys are decorative.
    Hovering a knob lights its parameter in the code and the other way
    round.
-   **Lean-in.** A straight glide forward, most of the way toward the
    closest pose that keeps the focal circle above and the knob row with
    its labels along the bottom. The console rises and comes forward to
    follow, its arms with it, in step with the camera, so it sits at a
    comfortable size instead of looming (`cfg.lean`, `cfg.console.lean`).

Open: the window's proportions and strut layout, tuned by eye in
`src/cockpit/layout.ts`; whether the console's decorative controls get
real actions.

## What changes

| Today | With the hanging rig |
|---|---|
| Camera close to the front wall | Camera further back; the portal keeps its size on screen |
| Panels are concave patches of the sphere wall | Panels are hanging monitors with convex glass |
| One unibody chrome console that everything is molded into | Separate pieces hung on arms, with open space between and behind them |
| Knobs on an arc around the portal's left side | Knobs in the top row of a hanging control console, just below the portal on screen |
| Chrome tubes running from each knob to the source panel | No tubes; the link between a knob and its code is carried by color |
| Everything at roughly one depth | Three depth layers: the rig near the camera, open air, the portal at the front |

Everything else is unchanged: what each panel shows, the editor
overlay, the knob model ([Knobs and state](knobs-and-state.md)), the
fixed view and its side focus and lean-in views, and pointer picking
by raycast against real geometry.

## Depth and composition

The cockpit is arranged in three layers, from the camera outward:

1.  **The rig.** Hanging monitors and the control console, close to the
    camera. They frame the portal on the left, right and below.
2.  **Open air.** The empty volume of the cockpit between the rig and
    the front wall. Arms, cables and the companion live here.
3.  **The portal.** Set into the front wall of the sphere, the furthest
    and brightest thing in view.

The portal must stay the focal point. The rig frames it and never
overlaps it from the default view. Seen from the default view, the
gaps between the rig's pieces show the cockpit shell behind them, so
the space reads as a room the user sits in rather than a wall they face.

### Pulling the camera back

The camera moves back from the front wall, and the portal is scaled up
by the same ratio, so it covers the same part of the screen as today.
The field of view stays roughly where it is.

The alternative, keeping the portal's size and narrowing the field of
view (a dolly zoom), is rejected: a narrow view flattens perspective,
which is the opposite of the goal. With a normal field of view and the
rig close to the camera, small head movements (side focus, lean-in,
and later idle sway) produce strong parallax between the near rig and
the far portal, and that parallax is what makes the depth legible.

The sphere grows with the camera distance so the shell around the
portal keeps a gentle, visible curve. The final radius, camera distance
and field of view are tuned by eye in the dev tuning panel, like today.

## Hanging monitors

Each existing panel becomes its own monitor: the code display, the
function plot, the status readout and the library. The portal does not
hang. It stays set into the front wall.

### Glass

-   The screen is a **convex** cap that bulges gently toward the viewer,
    like CRT glass, the reverse of today's concave wall patches. The
    bulge is modest: enough that reflections slide across it and the
    edges of the image bow slightly, not so much that text is hard to
    read.
-   The glass is reflective. It picks up the cockpit's environment map,
    the portal's glow and the other monitors, with a fresnel falloff so
    reflections are strongest toward the edges and the content stays
    clear in the middle.
-   The content sits a hair behind the glass surface, so the reflections
    read as a layer in front of the image.
-   Optional CRT touches, all subtle: a faint vignette and corner
    darkening, a very fine scanline texture. No signal noise or color
    bars on panels that carry real information.
-   The convex shape is real geometry, for the same reason the current
    curvature is: pointer picking stays exact (clicking a line of code,
    scrolling the source, picking a library entry).

### Body

-   **Not bulky.** A thin, flat-backed case, a few centimeters deep at
    cockpit scale, closer to a modern monitor than a CRT tube. From the
    default view the case side is just a sliver behind the bezel.
-   **Chrome bezels.** Each screen keeps a polished chrome bezel, molded
    and filleted like today's, so the house style survives the
    breakup of the console. Bezels are the brightest metal in the
    cockpit.
-   **A shared family, not a matched set.** Monitors can differ in size
    and aspect to fit what they show, but they share one bezel profile
    and one case design, so the rig feels designed rather than salvaged.
-   The back of each case has a mount where its arm attaches, visible
    from the side views.

## Mechanical arms

Every monitor and the control console hangs from the ceiling on its own
arm.

-   **Ceiling mounts.** Each arm starts at a mount on the inner surface
    of the sphere above the camera: a turntable plate, or a short rail
    that the mount slides along.
-   **At least one point of articulation.** Each arm has at least an
    elbow between two straight segments. Most also have a wrist (a tilt
    yoke) where they meet the monitor. The console's arms may be
    simpler and stiffer.
-   **Posed, not symmetric.** No two arms share the same angles. Each
    reads as having been swung, bent and locked into place by the pilot
    to build their ideal setup: an elbow bent further on one side, a
    monitor tilted a few degrees toward the seat, a rail mount slid off
    center. The arrangement looks chosen, not manufactured.
-   **Joints show their mechanism.** Each joint has a visible pivot pin,
    a lock collar or clamp knob, and a hint of the cable running through
    or alongside the arm.
-   **Material.** The arms are darker and less mirror-like than the
    bezels, for example a dark brushed metal or gunmetal, with chrome
    only on joint caps and collars. This keeps the arms legible as
    structure and leaves the chrome for the things the user looks at.
-   **Fixed in this version.** The arms are posed once in the layout and
    do not move. Letting the user drag a monitor and have its arm follow
    (inverse kinematics on the arm's joints) is a later feature. So is
    a monitor swinging into view on its arm, the physical form of the
    camera and panel changes described under
    [Fixed view](ui.md#fixed-view).

Arms are not clickable and must never cover an interactive part of a
monitor or the console from any of the three views. Where an arm passes
in front of something from a side view, the layout is adjusted rather
than making the arm transparent.

## Hanging control console

The knobs move from the arc around the portal to a control console that
hangs below the portal on screen.

-   **Position.** Hung on the same arm design as the monitors (probably
    two arms, as it is wider), closer to the camera than the portal and
    at about the same depth as the monitors. From the default view it
    sits just below the portal, without overlapping its bezel.
-   **Shape.** A wide, shallow panel, slightly tilted back toward the
    user like a keyboard tray, with the same chrome edge treatment as
    the monitor bezels.
-   **Top row: the eight knob slots.** The first row is the knob row,
    with one slot for each of the eight knobs (`KNOB_SLOTS`). An empty
    slot shows as a dark, recessed socket. A filled slot holds a knob
    that behaves exactly as today: drag vertically, modifier for fine
    control, double-click to reset. (The flat popover for label, range
    and step is replaced by the [control board](control-board.md).)
-   **The rest: buttons and keys.** Below the knob row, the console is
    filled with smaller controls: rows of keys, square backlit push
    buttons, a few toggles and indicator lamps, in the spirit of the EVA
    pod's button banks ([Reference interfaces](ui.md#reference-interfaces)).
    In this version they are decorative, with small press animations and
    lamps that react to state (compile status, playback). Wiring some of
    them to real actions (play, pause, restart, render quality, starter
    examples) is a natural follow-up, and they are laid out so that can
    happen without moving anything.
-   **Labels and values.** Each knob's label and value stay readable on
    the console, on a small strip or engraved plate beneath the knob.

### Linking knobs to code without tubes

The chrome tubes made the knob-to-code link physical. Without them, the
link is carried by color, as it already partly is:

-   Each knob's ring or cap is lit in its color, and its parameter is
    tinted the same color in the code display.
-   Hovering or turning a knob briefly brightens its parameter in the
    code, and hovering a tinted parameter brightens its knob.

A later version can bring the physical link back as loose cables
hanging between the console and the code monitor, one per knob, through
the open air layer.

## Views

The three views keep their meaning; their poses are retuned for the new
depth.

-   **Default.** The whole rig and the portal in one composed view, as
    today.
-   **Side focus.** Turning toward a side now turns toward the monitors
    on that side, which are close and big, so the turn can be smaller
    than today's. The near monitors swing past the far portal, which is
    the strongest depth cue in the design.
-   **Leaned in.** Today the lean-in frames the portal and the knob
    ring. With the console near the camera, a straight lean toward the
    portal would push the console out of the bottom of the frame or
    through the camera. The lean-in instead glides the head straight
    forward while the console rises to follow, framing the portal with
    the console's knob row along the bottom edge.

## The companion

The open air layer gives the companion ([Companion](companion.md)) a
natural home: it floats between the rig and the portal, or between
monitors, rather than in a thin gap in front of a wall.

-   Its keep-out zones become the projected silhouettes of each monitor,
    the console, and the arms, plus the portal. The tubing zone goes
    away.
-   It must not pass through arms or cases as it moves between perches.
    Its paths are checked against the rig's bounding volumes.
-   Its home perch moves from "near the console" to the open air just
    above the console and to one side of the portal, tuned by eye.

## Materials and lighting

-   The cockpit shell behind the rig gets darker and less reflective
    than today's liquid chrome, so the rig and the portal stand out
    against it. Some ribbing or panel seams on the shell help it read
    as a surface at a distance.
-   The portal's glow lights the back of the rig: a soft rim light on
    the arms and the backs of the monitors, tinted by the shader. This
    starts on the path toward the whole-cockpit lighting moods in the
    [Reference interfaces](ui.md#reference-interfaces).
-   Monitor screens are emissive and cast a faint light onto the
    console and arms nearby.

## Implementation notes

-   **Layout moves into 3D.** Today the layout (`src/cockpit/layout.ts`)
    places everything in wall units on the sphere. The rig's pieces are
    placed in cockpit space instead: each has a ceiling mount point, arm
    joint angles, and a monitor position and orientation. The portal
    keeps its wall placement. The dev tuning panel gains controls for
    each piece and joint.
-   **Removed:** the unibody chrome console (`src/style/console.ts`) and
    the knob tubing (`src/knobs/tubes.ts`), including the console's
    molded ridges and the goo cores.
-   **Replaced:** the concave wall patch geometry for panels
    (`src/panels/patch.ts`) is replaced, for monitors, by a convex glass
    cap inside a bezel. The portal keeps a wall mount.
-   **Kept:** panel content rendering, pointer mapping from hit point to
    panel UV, knob behavior and popovers, the editor overlay (placed over
    the code monitor's screen rectangle), and the compositor's cached
    cockpit render. Because the arms and monitors are static, the cache
    still holds; only the portal, the screens and the knobs update every
    frame.
-   **Performance.** Reflective convex glass on four or five monitors
    must stay within budget on the low-graphics setting. The low
    setting can drop to a static, pre-blurred environment reflection.

## Open questions

-   Final camera distance, sphere radius and field of view.
-   The size, aspect and placement of each monitor, and which side each
    panel hangs on.
-   How much bulge the glass can take before the code display becomes
    harder to read.
-   Whether the console's buttons and keys get real actions in the same
    release or later.
-   One arm or two for the console.
