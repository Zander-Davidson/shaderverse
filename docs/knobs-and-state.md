# Shader, knob and project state

*Part of the [Shaderverse design docs](README.md).*

## A single source of truth

The cockpit's visual controls are representations of application state.
They are not the source of truth.

A central project store holds the shader source, the knob list, playback
state, and UI state such as whether the editor overlay is open. Every
change to the project goes through named store actions: typing, creating
a knob, turning a knob, and later the AI agent. The 3D scene and the
overlays only read the store and dispatch actions.

## Knobs are parameters of `mainImage`

Shaders follow the Shadertoy convention, with the entry point
`mainImage(out vec4 fragColor, in vec2 fragCoord)`. Knobs are extra
parameters of that function:

``` glsl
void mainImage(out vec4 fragColor, in vec2 fragCoord,
               in float ringFreq, in float speed)
```

How this works:

-   **Creating a knob.** In the editor overlay, the user selects a
    numeric literal and chooses to create a knob. A single undoable edit
    replaces the literal with a parameter name and appends that
    parameter to the `mainImage` signature. The knob's starting value is
    the literal it replaced, so the image does not change at that
    moment.
-   **The hidden wrapper.** At compile time the app surrounds the user's
    source with a generated wrapper. It declares one uniform per knob
    parameter, and the real `main()` calls `mainImage`, passing those
    uniforms in. The user never sees the wrapper.
-   **Turning a knob** updates only its uniform. There is no recompile.
-   **Recompiling** happens only when the source changes: typing, or
    adding, removing or renaming a knob.
-   **One named parameter per knob.** Names keep the code readable and
    label the knobs. The app proposes a name and the user can rename it;
    a rename updates the signature and every use inside `mainImage`.

## The signature declares the knobs

Each time the source changes and parses, the app reconciles the
`mainImage` signature with the knob list:

-   **A new parameter** creates a new knob with a default value and
    range. A user who types a parameter by hand gets a knob for free.
-   **A removed parameter** removes its knob. Its metadata is kept for
    the session, so undo brings the knob back with its range intact.
-   **An unchanged parameter** keeps its knob, value and range.

Deleting a knob through its popover "bakes" it: every use is replaced by
the knob's current value and the parameter is removed from the
signature.

## Knob metadata

The signature decides which knobs exist and their types. The project
file holds each knob's metadata, keyed by parameter name.

Each knob record includes:

-   **ID:** Stable identifier.
-   **Parameter name:** The `mainImage` parameter it binds to.
-   **Label:** Human-readable name shown on the knob.
-   **Type:** `float` or `int` in v1.0. Vectors and colors later.
-   **Value and default:** Current and initial values.
-   **Range:** Minimum, maximum and step size.
-   **Slot:** Where the knob sits in the cockpit.

Reserved for later versions (present in the schema, empty in v1.0):

-   **MIDI mapping:** Device, control and response configuration.
-   **Intuition:** Plain-language description.
-   **Mathematics:** Relevant equation or concept.
-   **Implementation:** Corresponding GLSL expression.
-   **Learning context:** Related concepts, experiments and tags (also
    used by the v1.3 knowledge graph).

## What can become a knob in v1.0

-   `float` and `int` literals inside the body of `mainImage`. Integer
    knobs move in whole steps.
-   Individual components of a vector literal, each as its own `float`
    knob. Vector and color knobs come later.
-   Only the selected occurrence of a value is replaced. "Replace all
    occurrences" comes later.

The app declines, with a short explanation, literals that:

-   Live in other functions. A `mainImage` parameter is not visible in
    helper functions. Threading a parameter through helper functions is
    a job for the v1.1 agent.
-   Appear where GLSL requires a constant expression: `const`
    initializers, array sizes, `case` labels and preprocessor lines.

Shaders that the app cannot analyze reliably (for example, `mainImage`
defined through macros, or defined more than once) still run, but knob
creation is disabled for them.

## Baking and export

Exporting a shader can bake every knob: each parameter is replaced by
its current value and the signature returns to the standard Shadertoy
form, so the shader runs anywhere `mainImage` shaders run.

## Project format

A project is a versioned JSON document containing the schema version,
the shader source, knob metadata, playback settings, timestamps, and the
reserved fields above. The same format is used for v1.0 autosave and
file import and export, for v1.1 agent output, and for the v2.0
database.

## Action log

Every store action is recorded with its actor (user, or later agent) and
a timestamp. Text undo remains the editor's job. The log is groundwork
for session history and gives v1.1 and v1.2 agents a shared record of
what happened.

## The architectural rule

The important rule is that the shader, the 3D controls, MIDI mappings
and explanations all reference one shared, explicit model of parameter
state.

Changing a knob updates the parameter state, which updates the shader
and any related readouts. MIDI input will update that same state. The
mathematical display will derive its information from the same parameter
identity.

This avoids creating separate, inconsistent representations of the same
control.
