# The control board

*Part of the [Shaderverse design docs](README.md).*

**Status:** built (see [As built](#as-built) for where it differs).
Reworks the hanging control console from [The hanging rig](hanging-rig.md)
so that knobs are edited and baked without a popover, following
[No modals](no-modals.md).

Before this, clicking a knob opened a flat popover beside it with the
knob's label, name, range and step, and a "Delete (bake)" button. The
popover is gone. In its place the console gains three physical features:

-   A **knob edit display** recessed into the console, left of the
    knobs, where one knob's settings are edited.
-   A **bake button** under each knob, hidden under a bubble until that
    knob is being edited.
-   A **BAKE key** and a sheathed **bake all button** right of the
    knobs, which bake every knob at once.

Baking rewrites the source, and from the console there is no way back, so every bake is
behind a physical safety: a button that is covered until the user has
deliberately exposed it. That replaces the confirmation a modal would
have asked for.

## Layout

The console widens to make room for a bay on each side of the knob row.
Everything else on the console (the knob row, the TRANSPORT, QUALITY,
SYS and AUX controls) keeps its position relative to the knobs.

```
 ┌───────────────────────────────────────────────────────────────────────┐
 │ ╭──────────────╮   ◯    ◯    ◯    ◯    ◯    ◯    ◯    ◯      ╭───╮  │
 │ │  KNOB EDIT   │  lbl  lbl  lbl  lbl  lbl  lbl  lbl  lbl     │ ● │  │  ← bake all
 │ │   display    │   ◠    ◠    ◠    ◠    ◠    ◠    ◠    ◠      ╰───╯  │    button in
 │ │              │  (bake bubbles)                              BAKE   │    its bubble
 │ ╰──────────────╯  TRANSPORT  QUALITY   SYS     AUX            ┌─┐   │
 │                   ▢ ▢       ▢ ▢ ▢     • • ╿ ╿  ▮▮▮▮▮ ▮▮       │⌐│~☺ │  ← key + charm
 └───────────────────────────────────────────────────────────────────────┘
```

-   **Left bay:** the knob edit display, as tall as the knob row plus
    the control row.
-   **Knob row:** unchanged, plus a bake bubble under each label strip,
    in the gap above the section captions.
-   **Right bay:** the BAKE key slot low, level with the control row;
    the bake all button and its bubble above it, level with the knob
    row. The word **BAKE** is engraved on the face just above the key
    slot.

`src/console/plan.ts` stays the single source for these positions
(knob slots, controls, bays), so the camera, companion keep-outs and
tests read them from one place.

## Colors

The knob accent is teal (`KNOB_TINT`, `COLORS.knobGlow`). Anything in
an edit or bake state switches to the palette's yellow,
`COLORS.warn` (`#ffc24f`), exported as a new `KNOB_EDIT_TINT`. Warn
yellow is chosen over `plotGlow` (`#ffcc4d`, nearly the same hue)
because it already means caution, and plot amber has its own meaning in
the code display. The two are close enough that they read as one
yellow on screen.

Bake buttons are a saturated red, close to `COLORS.error` but deeper
and glossier, so they read as hardware rather than as an error lamp.

## Knob edit mode

One knob at a time can be in knob edit mode.

**Entering.** A click on a knob (press and release without dragging)
puts it in edit mode:

-   Its ring and cap glow switch from teal to yellow. Its parameter in
    the code display switches to yellow too, so the link between the
    knob being edited and its code stays visible.
-   The knob edit display turns on and shows that knob's settings.
-   The bubble under the knob retracts into the console, revealing its
    bake button.

Clicking a different knob moves edit mode to that knob: the first
knob's bubble closes as the second one opens, and the display switches
to the second knob.

**Leaving.** Any of these exits edit mode, reversing the animations
(yellow back to teal, display off, bubble closing over the button):

-   Clicking the same knob again.
-   Turning the knob (any drag past the click threshold). The knob
    turns as usual; edit mode is for settings, not for value.
-   Pressing Escape while focus is not in a display field (Escape in a
    field first leaves the field, see below).
-   Turning the BAKE key (see [Bake all knobs mode](#bake-all-knobs-mode)).
-   The knob being baked or removed from the code.

Clicking empty space or another panel does *not* exit: edit mode is a
state of the console, not a popover, and the user may want to look at
the code while editing a range.

**Double-click** still resets a knob to its default. The click that
starts a double-click is not counted as an edit-mode click (the
existing 280 ms click timer already makes this distinction).

**Right-click** on a knob does nothing; it used to open the popover.

## Knob edit display

A small screen recessed into the console's face, left of the knobs. Its
edge is a curved bezel like the monitors' (`src/panels/monitor.ts`),
but sunk into the console rather than standing proud of it: the bezel
rolls down into the face, and the glass sits below the console surface.

**Off.** With no knob in edit mode the display is dark glass, showing
only reflections and a faint scanline texture, like a powered-down CRT.

**On.** Entering edit mode brings the knob's page up with the monitors'
[page change](no-modals.md#monitor-pages-and-transitions), as do
switching knobs and leaving edit mode. It shows:

```
KNOB 3 · FLOAT            ● edit
NAME    speed_____________
MIN     0.000   MAX   4.000
STEP    0.010
VALUE   1.250   DEFAULT 1.000
[ RESET VALUE ]
```

-   **NAME, MIN, MAX, STEP** are editable fields. There is one name:
    renaming the knob renames its parameter in the code and sets the
    label on its strip to match. Clicking a
    field focuses it: the field is drawn with a yellow outline and a
    caret, and keystrokes go to an invisible input layer placed over the
    field's screen bounds (the same technique as the in-scene editor,
    `src/editor/sceneEditor.ts`). Enter or Tab commits and moves to the
    next field; Escape reverts the field and leaves it.
-   **VALUE** and **DEFAULT** are readouts. VALUE follows the knob live.
-   **RESET VALUE** is an on-screen button (the double-click shortcut
    still works too).
-   Errors from the store (minimum above maximum, a name that clashes)
    appear on the display's bottom line in error red, and the field
    keeps its edited text until it is fixed or reverted.
-   There is no delete or bake button on the display. Baking is done
    with the knob's own bake button.

The validation, clamping and rename logic moves unchanged from
`KnobPopover.apply` into the display.

## Bake knob buttons

Each knob has a small bubble beneath its label strip.

-   **Look.** A small dome of clear, slightly frosted resin, with a dim
    red shape inside it. It must not look clickable (no hover glow, no
    cursor change, no press animation), but it must not look like part
    of the console body either: a separate fitted part, with a thin
    seam where it meets the face. Empty slots have a bubble too, so the
    row stays regular.
-   **Unsheathing.** When its knob enters edit mode, the bubble slides
    down and back into the console (about 250 ms, easing out), leaving
    a little red button standing in a shallow well.
-   **Pressing.** The red button clears the knob and bakes its current
    value into the code (the store's `deleteKnob`). It presses down
    like the other console buttons; on release the knob's cap retracts,
    edit mode ends, and the bubble rises back over the (now idle)
    button.
-   **Sheathing.** Leaving edit mode any other way plays the
    unsheathing in reverse.

Only the exposed button is a pointer target. The bubble is not.

## BAKE key

A sci-fi keyswitch to the right of the knobs, modelled on a missile
launch key: a cylindrical chrome lock body set into the console, with
a flat, chunky key in it and a short collar around the slot. **BAKE**
is engraved above the slot, with OFF and ARM tick marks either side of
it.

**The charm.** A small charm hangs from the key's ring on a short
chain: a little spiky ball with a simple, expressive face, eyes
squeezed shut like `>_<` and bared, gritted teeth. It hangs below the
key and swings when the key moves.

**Turning.** Clicking the key turns it a quarter turn clockwise to ARM
(about 300 ms, with a slight overshoot and a settle, like a detent),
and enters [bake all knobs mode](#bake-all-knobs-mode). Clicking it
again turns it back to OFF with the reverse animation and exits the
mode.

**Charm physics.** The charm is simulated, not keyframed: a two-link
pendulum (the chain, then the charm) hanging from the key ring, with
gravity in the console's frame (which is tilted back), damping, and a
collision plane at the console face so it rests against and bounces
off the panel. Turning the key moves the ring, which drives the
pendulum, so the charm jangles and settles over a second or so.
Hovering the key gives it a tiny nudge. A cheap verlet step on the
CPU is enough; there is only one charm.

## Bake all knobs mode

Entered and left only with the BAKE key.

-   **Knobs:** every knob glows yellow and stops responding to the
    pointer (no turning, no edit mode, no reset). The cursor over them
    is the default arrow. Turning the key while a knob is in edit mode
    exits edit mode first.
-   **The bake all button is unsheathed.** Above the key, a larger
    bubble covers a large red button. Entering the mode lifts the
    bubble on a hinge at its back edge, like a switch guard opening,
    and the button lights up from within. Leaving the mode closes the
    bubble again.
-   **Pressing the bake all button** bakes and clears every knob in one
    action: one source rewrite using `bakeAll` from
    `src/source/rewrite.ts`, so a single undo brings every knob back. The knob caps retract one after another,
    left to right, in quick succession.
-   **After baking,** the console stays in bake all mode (the key is
    still at ARM) with nothing left to bake: the button stays exposed
    but goes dark. Turning the key back closes the bubble.
-   **Adding a knob** while armed (making one from a literal, typing a
    parameter into the signature, or undoing a bake) turns the key back
    to OFF on its own, returning the console to normal. See
    [Open questions](#open-questions).
-   **The bake all button is clickable only in this mode.** With the
    bubble closed, it is not a pointer target.
-   Everything else in the cockpit (the portal, the code, playback)
    works as normal.

## State

UI state in the store replaces `popoverKnobId`:

| Field | Meaning |
|---|---|
| `editKnobId: string \| null` | The knob in knob edit mode |
| `bakeArmed: boolean` | Whether the BAKE key is at ARM |

New actions: `editKnob(id)`, `stopEditingKnob`, `setBakeArmed(armed)`
and `bakeAllKnobs`. `bakeAllKnobs` fails unless `bakeArmed` is set,
so a stray dispatch cannot bake everything. `deleteKnob` and
`setBakeArmed(true)` clear `editKnobId`. The animations (key turn,
bubbles, charm) are driven by the console panel from these fields, so
loading a project or undoing resets them correctly.

## Code changes

-   `src/overlays/popover.ts` and its styles are removed.
-   `src/console/plan.ts`: the console's new width, the two bays, bubble
    and key positions, and the edit display's rectangle.
-   `src/console/console.ts`: the edit display (a recessed screen with
    its own canvas), the key, charm, bubbles and bake buttons as
    pointer targets and animated meshes.
-   `src/knobs/knobs.ts`: click toggles edit mode instead of opening the
    popover; the yellow tint; ignoring the pointer while armed; no
    right-click.
-   `src/panels/code.ts`: the edited knob's parameter in yellow.
-   `src/theme.ts`: `KNOB_EDIT_TINT`.
-   `src/project/store.ts`: the state and actions above.
-   The help list and the companion's keep-out zones pick up the new
    controls.

## Tests

-   Store: edit mode toggling, switching knobs, `bakeAllKnobs` refused
    when not armed, a bake all is a single source change.
-   Playwright: click a knob, edit its range on the display, see the
    knob's range change; click its bake button and see the parameter
    replaced by its value in the code; turn the key, check knobs ignore
    drags, press bake all, see a shader with no knob parameters that
    renders the same image.

## As built

-   **Size.** The console is 10.7 panel units wide (from 7.2), with the
    knob row `ROW_X` right of its center, and hangs at a smaller scale
    (0.33, from 0.43) so it clears the code and library monitors. The
    knobs are about a quarter smaller on screen sitting back.
-   **Leaning in** frames the whole console, bays included, so the knobs
    grow less than before (about 1.3× rather than 1.5×). The side
    monitors now stay in view, and the companion's leaned-in perches
    moved into the gaps between them and the portal.
-   **Holes in the face.** The display, the bubble wells and the bake all
    well are cut out of the console's face texture, and its hit test lets
    the pointer through them to what's sunk below.
-   **Page change.** The display turns on, off and switches knobs with the
    monitors' page change (`src/panels/pageChange.ts`), the same block
    shift the library uses for its confirm page.
-   **One name field.** LABEL and NAME are merged into NAME, which sets
    both the parameter and the strip's label.
-   **Bake buttons** rise in their wells and glow faintly when uncovered,
    so they read at console scale. The bake all button lights only while
    the key is at ARM and there is something left to bake.
-   **Baked caps** sink into the face and come back up bare; after a bake
    all they go left to right, 70 ms apart.
-   **The charm** hangs on a chain that can go slack, long enough to clear
    the lock body and rest on the face below the key. It sleeps once it
    has been still for half a second.

## Open questions

-   Whether the key should turn itself back to OFF after a bake all
    (cleaner, but less like a real key). The current answer is no.
-   The charm's name.
-   Whether the edit display should also hold the knob's assigned slot,
    so knobs can be moved between slots from the console.
