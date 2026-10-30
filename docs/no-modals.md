# No modals

*Part of the [Shaderverse design docs](README.md).*

**Status:** design. The first piece, the
[library confirmation](#first-piece-the-library-confirmation), can be
built now.

There are no modals in Shaderverse. No browser dialogs, popups,
popovers, tab strips, dropdown menus or menu screens. The user is
sitting in a cockpit, and every interaction happens on something in
that cockpit: a physical control on the console, or a page on one of
the hanging monitors.

When a feature would traditionally need a modal (a confirmation, a
settings form, a menu, a sign-in screen), it is handled in one of two
ways:

-   **Physically, through the console.** A control with real states:
    a key that turns, a cover that lifts, a button that is only exposed
    when it is safe to press. The state is the confirmation. See the
    [control board](control-board.md).
-   **On a monitor.** The monitor that owns the feature changes what it
    shows. The change is an on-screen transition, so it reads as the
    machine switching pages, not as something floating over the scene.

## What this is called

The general idea has a name: **diegetic UI**, interface that exists
inside the world (the term comes from film; games such as *Dead Space*
and the *Fallout* Pip-Boy are the usual examples). Its opposite is
non-diegetic UI: HUDs, dialogs and menus that float over the world and
that only the player can see. Shaderverse aims for fully diegetic UI.

The specific patterns used here also have names:

| Pattern | Name | Where it is used |
|---|---|---|
| A monitor switching to a "are you sure?" page instead of a dialog | **Inline (in-place) confirmation** | The library, below |
| A key that must be turned before a button can be pressed | **Arming**, or a **two-stage commit** (from launch keys and the two-person rule) | Bake all knobs ([control board](control-board.md)) |
| A clear cover over a dangerous button | A **safety cover** or **switch guard**; engineers call one a **molly-guard** | Bake buttons ([control board](control-board.md)) |
| A screen breaking into blocks that move and settle into the next screen | A **pixel dissolve** or **mosaic transition**; with moving blocks, a **block-shift** transition | Monitor page changes, below |

"Skeumodal" is a good private name for the whole idea, but the
established term to search for is diegetic UI.

## Rules

1.  **No browser dialogs.** `alert`, `confirm` and `prompt` are not
    used anywhere.
2.  **No DOM layers that read as floating.** DOM is still allowed as an
    invisible input layer (the in-scene editor already does this:
    CodeMirror takes keyboard and IME input in an invisible layer while
    the curved panel draws the text). What the user sees is always
    drawn on a monitor or the console.
3.  **Every feature has a home.** Before a feature gets UI, decide which
    monitor or console section owns it. A new kind of feature can earn
    a new monitor or console bay; it never earns an overlay.
4.  **Pages, not stacks.** A monitor shows one page at a time and
    returns to its home page when the task is done or cancelled. There
    is no stack of dialogs to dig out of.
5.  **Cancel is always visible and always Escape.** A monitor page that
    asks a question shows a way back on the screen, and Escape takes it.
6.  **The shader keeps running.** Nothing in this design pauses the
    portal or covers it.

## Monitor pages and transitions

Each monitor panel has a **home page** (what it draws today) and can
switch to other pages. A page is just another `draw` routine on the
same canvas, with its own buttons.

Switching pages plays a short transition on the monitor's screen:

1.  **Break up.** The current page is drawn into an offscreen canvas
    and broken into blocks, a few pixels square, that quantize toward a
    coarse mosaic.
2.  **Shift.** Rows of blocks translate sideways, staggered by row and
    with a little noise per block, the old page's blocks sliding out as
    the new page's slide in (like a CRT losing and catching horizontal
    sync).
3.  **Settle.** The blocks resolve back to full resolution on the new
    page, with a brief scanline flicker.

Target length: about 300 to 400 ms. It is fast enough to never feel
like waiting, and visible enough to read as the machine doing
something.

**Implementation.** The monitors already render their canvas through a
custom CRT material (`src/panels/monitor.ts`). The transition is a
second texture (the previous page) and one `progress` uniform in that
shader: per block, a hash decides its delay and direction, and the
fragment samples either the old or the new page at a shifted UV. The
panel only has to snapshot its canvas before drawing the new page.
Panels stay unaware of the effect beyond calling something like
`showPage(page)`.

With `prefers-reduced-motion`, the transition becomes a quick dither
dissolve in place, with no movement. With `?gfx=low` it is a plain cut.

## First piece: the library confirmation

Today, choosing an example in the library while the project has edits
calls `window.confirm` (`src/app.ts`, `loadExample`). It becomes an
inline confirmation on the library monitor.

-   Clicking an example with no unsaved edits loads it immediately, as
    now.
-   Clicking an example when the project has been edited block-shifts
    the library monitor to a **confirm page**:

    ```
    LIBRARY                                   v1.0
    ──────────────────────────────────────────────
    LOAD 04 PLASMA?

    The current project has edits that will be
    replaced. Download it first to keep it.

      [ ↓ PROJECT FIRST ]

      [ LOAD ]          [ CANCEL ]
    ──────────────────────────────────────────────
    ESC cancel · ENTER load
    ```

    -   **↓ PROJECT FIRST** downloads the project (the existing export)
        and stays on the page, the button changing to show it was
        saved.
    -   **LOAD** loads the example and transitions back to the home
        page, which now shows the new example as active.
    -   **CANCEL**, Escape, or clicking the same example again
        transitions back without changing anything.
    -   Clicking a different example while the page is up changes the
        question to that example (the page redraws in place; no second
        transition).
-   The number keys that load examples (`1` to `9`, `0`) go through the
    same path, so they also show the confirm page.
-   While the confirm page is up, the rest of the cockpit works as
    normal. Nothing is blocked; the question waits on its monitor.

**Code.** `LibraryActions.loadExample` stops confirming and the library
panel owns the decision: it keeps a `page: 'home' | { confirm: index }`
field, draws the confirm page when set, and calls a new
`replaceWithExample(index)` action on LOAD. The store does not need to
know about pages; they are panel state like hover. Tests: a Playwright
test that edits the project, clicks an example, sees the confirm page,
and checks that CANCEL keeps the source and LOAD replaces it (the
existing tests that accept the browser dialog are updated).

## Other modals in the app today

The library confirmation is the only browser dialog, but several other
pieces float over the scene. Each one has a planned home:

| Today | Problem | Planned home |
|---|---|---|
| Knob popover (`src/overlays/popover.ts`) | A flat form floating beside the knob | The knob edit display on the console ([control board](control-board.md)) |
| Knob right-click | Opens the popover, behaving like a context menu | Removed; a left click enters knob edit mode |
| Help overlay (`? KEYS`, `src/overlays/help.ts`) | A full-screen box | A **KEYS** page on the library monitor, through the same transition |
| Toasts (`toast()` in `src/overlays/help.ts`) | Notices that pop up over the scene | A message line on the status monitor, which holds the latest notice for a few seconds and fades it |
| Flat editor overlay (`?editor=overlay`) | A flat window over the code display | Already replaced by the in-scene editor by default; the flag stays as a fallback for debugging only |
| Project import file picker | An operating system dialog | Dropping a file onto the library monitor (with a drop highlight on the screen); the picker stays as a fallback until drop works, see [Open questions](#open-questions) |

The file downloads are not modal (the browser shows them in its own
download list) and stay as they are.

## Later: menus and sign-in

When Shaderverse grows menus, settings or a sign-in screen
([Roadmap](roadmap.md), v2.0), they live on the **status monitor** as
pages: it shows the machine's state, so it is also where the machine
is configured and where the operator identifies themselves.

-   A sign-in is a status page with input fields drawn on the screen
    and typed into through an invisible input layer, like the in-scene
    editor. A successful sign-in transitions back to the status page,
    which shows the operator's name.
-   A menu is a list on a page, navigated by pointer or by the arrow
    keys, never a dropdown.
-   If the status monitor gets crowded, the answer is another monitor
    on the rig, not a tab strip.

## Open questions

-   Whether the file picker can be dropped entirely. Drag and drop
    covers desktop users; a console key that opens the picker is a
    diegetic trigger for a non-diegetic dialog, which may be an
    acceptable exception.
-   Exact block size and timing of the transition, tuned by eye.
-   Whether the confirm page should time out and return home on its
    own after a while without input.
