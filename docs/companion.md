# The companion

*Part of the [Shaderverse design docs](README.md).*

The AI has a body: a floating glob of gel with a single eye. It lives
in the cockpit, keeps out of the way, and watches what the user is
doing.

**Working name:** the Ocellus (the name for the simple eye of an
insect or a jellyfish). Placeholder, see [open questions](#open-questions).

## Inspiration: Cruelty Squad

*Cruelty Squad* has an absurd interface. A border of slimy,
trypophobic gore rings the screen, and the health indicator is a
floating globule that deforms and pulses frantically as the player
gets close to dying. The interface is not a neutral frame around the
game. It is alive, it is gross, and it says how things are going
without a single number.

What Shaderverse takes from it:

-   **A living indicator.** State is shown by how a body moves (how it
    throbs, deforms, and looks around), not by a status label.
-   **Organic matter against clean machinery.** Something wet and
    unsettling sitting inside an otherwise polished interface. The
    contrast is the point.
-   **Disturbing and friendly at once.** Cruelty Squad's globule is
    hostile. Ours is the opposite: calm, attentive and on the user's
    side, but still clearly not human.

What it does not take: gore, frantic motion in normal use, or anything
that covers the work.

## Identity: an alien intelligence in a human machine

The cockpit is human engineering. It is futuristic and strange, but
its parts are machined: polished chrome, symmetric bezels, a regular
ring of knobs, panels with matching corner radii.

The companion is not. AI may as well stand for *alien intelligence*
here. It is a guest inhabiting the instrument, not a part of it:

-   **Asymmetric.** Never a perfect sphere. Its outline is lumpy and
    always slowly changing.
-   **Wet.** Glossy gel with a specular highlight, a soft rim light,
    and light trapped inside it, in the same material language as the
    *Gel Console* example shader (`examples/gel.glsl`).
-   **Unmounted.** Everything else is set into the wall. The companion
    floats free in the air between the user and the wall, and parallax
    makes that obvious whenever the camera moves.
-   **Calm.** Its resting state is a slow, gentle throb, like
    breathing. It is unhurried and never fidgets.
-   **One eye.** A single large eye orb inside the gel. It is the face,
    the attention and the expression all at once.

The intended feeling: a little unnerving the first time you notice it
watching you, then oddly comforting, like a pet.

## Body

-   **Form:** a metaball cluster of a few lobes (roughly three to six)
    around a core, sized to read clearly without competing with the
    knobs. Start at about the width of one knob face (`knobRing.size`,
    0.9 wall units) and tune by eye.
-   **Throb:** each lobe orbits and swells slowly on its own phase, so
    the outline drifts the way the Gel Console blobs do. The whole body
    also has a slow breathing pulse, about one cycle every 3 to 5
    seconds.
-   **Material:** translucent gel with normals from the field, a wet
    specular highlight, a fresnel rim and inner glow. Faint veins or
    inclusions inside the gel give it the slightly biological, slightly
    trypophobic quality, kept subtle.
-   **Color:** deliberately off the console's palette so it reads as
    foreign matter. See [open questions](#open-questions).
-   **Motion:** when it travels, the body lags and stretches along its
    path, and a lobe or droplet can trail behind and then rejoin
    (squash and stretch, done with the metaballs). It settles with a
    small wobble when it arrives.
-   **Idle drift:** a slow bob and sway around its perch (a Lissajous
    path of a few hundredths of a wall unit), never still.

## Eye

-   **Eyeball:** a glossy orb set into the gel, with a dark iris and
    pupil and a bright cornea highlight. The gel bulges slightly over
    it.
-   **Gaze:** the eye turns toward a target with a damped spring, so it
    follows smoothly but a beat behind. Gaze is mostly smooth pursuit,
    with occasional small saccades (quick jumps and fixations) so it
    feels like it is looking, not tracking.
-   **Blink:** every few seconds (randomized, roughly 3 to 8 s), a quick
    blink of 120 to 180 ms, sometimes a double blink. The lid is a
    translucent membrane that slides across the eye (nictitating), not
    a human eyelid: friendly in rhythm, alien in mechanism.
-   **Glimmer:** now and then a highlight sweeps across the cornea, or
    the iris brightens briefly.
-   **Pupil:** dilates when something interests it (leaning in, a new
    shader compiling, a knob being turned) and narrows slowly back.

## Behavior by view

The camera already has three views (`src/cockpit/scene.ts`): sitting
back facing the cockpit, turned toward a side's panels when the pointer
is over them, and leaned in to the portal when the portal is clicked.
The companion follows the camera between them and has a different job
in each.

### Neutral: sitting back

-   It rests at a home perch near the console, clear of every panel.
-   It looks at the user: the eye faces the camera.
-   It blinks and glimmers occasionally, and once in a while glances at
    something (the portal, a knob that just moved) and returns its gaze
    to the user.

### Side focus: turned toward the left or right panels

-   When the camera turns to a side, the companion drifts with it so it
    stays in view, settling at a perch on that side's inner edge: in
    the gutter between the side's panels and the portal, never over a
    panel.
-   Its eye follows the cursor. The target is the point on the wall
    under the pointer, so it looks at the line of code or the readout
    the user is pointing at.
-   It moves a beat after the camera does, so the user sees it follow
    rather than seeing it pinned to the screen.

### Leaned in: focused on the portal

-   When the camera leans in, the companion leans in too, moving closer
    to the portal and settling in a corner of the leaned-in view that
    the portal's circle and the knob arc leave empty.
-   Its attention turns to the canvas. Mostly it watches the portal: the
    point the user is dragging (`iMouse`) while they drag, otherwise
    somewhere near the center with slow wandering saccades, as if it is
    watching the pattern move.
-   Occasionally it glances at the knobs, especially the one being
    turned or the one most recently turned, and then back to the
    portal.
-   It never covers the portal or any knob.

### Transitions

When the view changes, it travels to the new perch along a smooth arc
with the body lag described above. Its gaze target switches at the
start of the move, so the eye leads and the body follows.

## Staying out of the way

The companion must never cover the portal, a knob, a panel, an overlay,
or the knob tubing, and must never block a click. (With the
[hanging rig](hanging-rig.md#the-companion), the tubing goes away and
the monitors, console and arms become the keep-out zones.)

-   **Keep-out zones**, computed from the layout (`src/cockpit/layout.ts`):
    every panel rectangle, the portal bezel (`bezelRadius`), every knob
    slot, the tubing between the source panels and the knobs, and the
    screen rectangles of any open overlay (editor, knob popover, help).
    Each keeps a margin.
-   **Perches:** each view has a short, ordered list of candidate perches
    tuned by eye in the dev tuning panel. The companion takes the first
    one where its projected silhouette, plus margin, is clear of every
    keep-out zone in the current camera's view. Reading the current
    layout (rather than fixed screen positions) means a relayout or
    resize moves the perches with it.
-   **Last resort:** if no perch is clear (a very narrow window, an
    overlay in the way), it retreats to the nearest screen edge and
    peeks in from behind it, eye still visible.
-   **Pointer:** it is not an obstacle in pointer picking. Only its own
    body is clickable, and since it never overlaps a control there is
    nothing for it to block.
-   **Depth:** it floats between the camera and the wall, close enough
    to show parallax, far enough that it never clips through the
    console when the camera turns or leans.

## Expressing the AI's state (v1.1 and later)

The throb is the status display. Calm is the baseline; any departure
from it means something.

| State | Body | Eye |
|---|---|---|
| Idle | Slow breathing throb | Watches the user or the work, blinks |
| Listening (prompt open) | Leans toward the prompt, throb slows | Fixed on the prompt input, pupil wide |
| Reasoning | Lobes circulate faster around the core | Saccades more often, looks inward/away |
| Synthesizing (writing code) | Steady quick pulse in time with output | Watches the code display, then the portal as it compiles |
| Success | One big swell and settle | Long blink, glimmer |
| Problem (compile failure, repeated retries) | Throb grows uneven and quicker the longer it lasts; lobes pull apart | Darts between the error line and the user |

The problem state is the direct borrowing from *Cruelty Squad*'s health
globule: the closer things are to going wrong, the more the body
deforms and the more frenetic the pulse. It stays well short of
frantic, and it returns to calm as soon as the problem clears.

## Interaction

-   **Hover:** it looks at the cursor and its pupil dilates slightly.
-   **Click (v1.1 and later):** addresses the AI. The flat prompt input
    opens next to it, following the overlay principle ([UI](ui.md)).
    The companion leans toward the input while the user types.
-   **Click (before v1.1):** a squish and a blink. Nothing else.
-   **Messages:** short contextual messages appear in a small flat
    bubble anchored to the companion, placed by the same keep-out
    rules, and fade out on their own.

## Rendering and performance

-   It animates every frame, so it renders in the live pass with the
    portal, not into the compositor's cached cockpit.
-   It is small on screen, so a raymarched metaball field inside a
    camera-facing quad (or a small bounding mesh) is affordable. A
    displaced, subdivided sphere is the fallback if the raymarch costs
    too much.
-   The low-graphics setting (`LOW_GFX`) drops the raymarch for the
    mesh, and the inner veins.
-   Eye, blink, gaze and perch logic are plain TypeScript driven by
    camera state and pointer position, testable without WebGL.

## Comfort settings

The companion is meant to be a little disturbing, and that will not
suit everyone.

-   **Reduced motion** (following `prefers-reduced-motion`, with an
    override): no idle drift and no squash and stretch; it moves between
    perches with a fade, and only blinks and gaze remain.
-   **Hide:** it can be dismissed. It sinks out of view and the AI is
    reached through a small fallback control instead.

## Scope

-   The body (form, throb, eye, gaze, perches and keep-out) depends only
    on the camera, the layout and the pointer, so it can ship before
    any AI exists. Building it first lets its motion be tuned on its
    own.
-   The state table, click-to-prompt and messages arrive with the v1.1
    agent ([Roadmap](roadmap.md)).

## Open questions

-   **Name.** "Ocellus" is a placeholder.
-   **Color.** Candidates: a pale, pearly flesh with faint red veins
    (most unsettling against chrome); a bile or acid green echoing the
    Gel Console (most cohesive); or a bioluminescent cyan-violet. The
    recommendation is the pale flesh, with the eye as the brightest
    part.
-   **Home perch.** Candidates in the current layout: overhead, above
    the portal's bezel between the knob arc and the right-hand panels;
    or low in the crook between the code panel and the bottom of the
    knob arc. To be chosen by eye.
-   **Size.** Starting at about one knob width; tuned by eye.
-   **The gore border.** *Cruelty Squad*'s living screen border is not
    part of this spec. If organic matter later spreads beyond the
    companion (for example, growth around the canopy that reacts to the
    AI's state), it belongs with the v1.3 aesthetic work.
