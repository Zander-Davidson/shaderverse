# Vision and identity

*Part of the [Shaderverse design docs](README.md).*

## Product vision

Shaderverse is an AI-powered creative coding instrument that helps
people develop mathematical intuition through hands-on shader
experimentation. It lets users progress from describing visual ideas in
natural language to directing generative graphics with mathematical
precision.

The user is not simply asking an AI to produce an image. They are
operating an unfamiliar but learnable instrument: shaping fields,
manipulating coordinate spaces, tuning oscillations, and discovering the
mathematics underlying what they see.

The experience should feel like piloting an alien technological system
whose controls reveal themselves through use.

**Guiding principle:** The AI should make itself less necessary over
time, without making the creative experience less fun.

### The central experience

1.  Describe a visual idea in natural language.
2.  Watch the system synthesize a working shader.
3.  Experiment with physical-feeling controls and observe cause and
    effect.
4.  Investigate the mathematical principles behind the result.
5.  Learn to express creative intent in increasingly precise
    mathematical terms.
6.  Direct the system more deliberately as intuition develops.

For example:

> "Give me a hexagonal tiling with pulsing colored circular waves
> emanating from the center of each hexagon."

Shaderverse generates the GLSL, identifies meaningful parameters,
exposes them as controls, and helps the user understand how the
resulting pattern emerges from mathematical operations.

That is the full vision. The roadmap ([Roadmap](roadmap.md)) gets there in steps:
in v1.0 the user writes or pastes GLSL and creates controls by hand, and
AI synthesis arrives in v1.1.

The outcome should feel less like receiving an answer from a chatbot and
more like discovering how to operate a powerful machine.

------------------------------------------------------------------------

## Naming and fictional identity

### Shaderverse

Shaderverse is the leading name. Its sound has a playful, slightly retro
computational quality, but the intended meaning is not a universe,
world, or virtual destination.

**Shaderverse is the name of the machine.**

The name should appear on the instrument itself, on a startup sequence,
and in the fictional system's technical markings. It should feel
plausible as the designation of a piece of advanced creative technology.

Potential presentation:

**SHADERVERSE**\
GENERATIVE FIELD SYNTHESIS SYSTEM\
UNIT C/7a\
SYSTEM INITIALIZING

The hardware designation is a worldbuilding device, not a requirement
that every screen display an elaborate fictional label. Use it
selectively to make the instrument feel like a specific artifact with a
purpose and identity.

### William Gibson as an influence

The naming and worldbuilding take inspiration from William Gibson,
especially *Idoru*: technology that feels simultaneously futuristic,
industrial, specific, and strange.

The reference point is the nanotechnology associated with constructing
Tokyo's buildings, including the fictional Rodel-van Erp
molecular-programming hardware. The useful inspiration is the *feeling*
of the technology: it has an actual technical function, a particular
designation, and a place in a larger world.

Shaderverse should evoke a similar sense of specificity.

It is not a generic "AI creative platform." It is a field-synthesis
instrument, designed to manipulate mathematical systems that generate
visual phenomena.

### Naming principles

-   Prefer the identity of a machine, instrument, or technological
    artifact over the name of a place.
-   Preserve the satisfying sound and memorable character of
    Shaderverse.
-   Favor technical specificity over generic futuristic vocabulary.
-   Use fictional hardware designations and subsystem labels sparingly,
    where they reinforce the experience.
-   Let the product's real capabilities support its fictional identity.
    The interface should not be merely a conventional app dressed in
    science-fiction styling.

------------------------------------------------------------------------

## Design philosophy: a fictional instrument, not a conventional app

The interface is a dynamically rendered, three-dimensional alien
console, seen from the inside: the user sits within a large spherical
cockpit, and every display and control is mounted on its curved inner
surface ([UI](ui.md)).

It should not resemble a conventional web application with rectangular
panels, tabs, a sidebar, and a large canvas. The design should feel like
a physical object built for a specialized purpose, with controls
embedded into its surface and displays integrated into its geometry.

The user should feel as though they are operating an advanced machine
whose interface was designed by an unfamiliar but intelligent
technological culture.

### Aesthetic influences

-   **William Gibson:** industrial specificity, believable fictional
    technology, and systems that suggest a larger world.
-   **The Matrix:** luminous technical information, dark reflective
    surfaces, and a sense of accessing hidden computational machinery.
-   **Alien:** biomechanical forms, organic complexity, mysterious
    industrial design, and the feeling that the machine is more than a
    collection of parts.
-   **Early-2000s Winamp skins:** expressive maximalism, custom
    interface surfaces, and a willingness to reject conventional
    software design.
-   **Frutiger Aero:** glossy, translucent, fluid, almost liquid
    materials.
-   **Contemporary experimental digital design:** unusual silhouettes,
    intricate surfaces, luminous details, and dense visual compositions.
-   **Cruelty Squad:** an interface that is alive. Organic, slightly
    repulsive matter intruding on the screen, and a floating globule
    that shows state by how it throbs and deforms. Shaderverse uses this
    for the AI companion ([Companion](companion.md)), made calm and
    friendly.

The result should be glossy, dark, organic, intricate, and slightly
uncanny.

Specific reference interfaces (the Fallout Pip-Boy, the Black Ops main
menu, the Nebuchadnezzar control room in The Matrix, and the EVA pod in
2001: A Space Odyssey) are described in [UI](ui.md#reference-interfaces),
with the features each one suggests.

### Design principles

**The portal is the focal point.** The generated shader is the primary
visual event and should dominate the composition.

**Controls orbit the work.** Parameters should be arranged radially
around the portal or embedded in nearby console surfaces. The interface
should exploit depth, curvature, layering, and spatial relationships
rather than forcing everything into rectangular containers.

**Important controls are physically close.** Frequently used, visually
expressive parameters should be within easy reach of the central portal.
Less frequently used systems can occupy the periphery.

**Mathematics is first-class.** The mathematical explanation of a
parameter should be easier to discover than the underlying code.
Learning should happen in context, without switching to a separate
educational mode.

**Code is present but secondary.** The GLSL editor should remain
accessible and editable, but it should not compete with the portal for
attention. In v1.0 the code is always visible on a curved display panel,
and a flat editor window opens over it when the user clicks in to edit.

**3D for seeing and touching; flat overlays for typing.** Displays and
direct-manipulation controls live in the 3D scene. Text entry (editing
code, naming a knob, typing a range) happens in flat overlay windows
that appear over the scene when needed and disappear afterward. This
keeps the illusion intact most of the time without requiring a custom
text editor rendered in 3D.

**The AI inhabits the machine but is not of it.** The cockpit is human
engineering: polished, machined, symmetric. The AI is an alien
intelligence living inside it, a floating glob of gel with one eye,
asymmetric and wet against the chrome ([Companion](companion.md)). It
should feel like a resident of the instrument, never a chatbot pasted
onto the side.

**Maximalism is intentional.** Rich textures, decorative markings,
luminous indicators, embedded mechanisms, and layered technical details
are welcome. Visual complexity should create a sense of mastery over an
esoteric system, not make essential controls impossible to understand.

------------------------------------------------------------------------

## Success criteria

Shaderverse succeeds when it feels like a coherent creative instrument
rather than a collection of software features.

### v1.0 success

-   A single-pass Shadertoy shader (one with no texture channels) can be
    pasted in and runs.
-   Typing updates the portal within a fraction of a second. Errors
    appear on the correct lines while the last good shader keeps
    running.
-   Selecting a literal and turning it into a knob takes a few seconds,
    and turning the knob is smooth, with no recompile and no hitch.
-   Everything fits in one fixed view. The curvature is subtle but
    noticeable, and the code is legible on the curved display.
-   A project survives a page reload, and export followed by import
    gives back the same project.

### Creative success

-   Users can describe a visual idea and get a useful starting point.
-   Parameter manipulation feels immediate, expressive, and satisfying.
-   Users can explore variations without constantly rewriting code.
-   The generated visuals remain the primary creative reward.

### Educational success

-   Users can explain the effects of parameters they have manipulated.
-   They begin recognizing mathematical patterns across different
    shaders.
-   They move from visual descriptions toward more precise mathematical
    instructions.
-   Explanations help users understand the work rather than simply
    accept AI-generated output.

### Interaction success

-   The portal remains visually dominant.
-   Important controls are discoverable and feel integrated into the 3D
    cockpit.
-   Mathematics and code are accessible without interrupting creative
    flow.
-   Virtual controls, MIDI, and shader output remain synchronized.

### Identity success

-   The system feels like a particular piece of fictional technology.
-   Its visual language is distinctive without sacrificing usability.
-   The Gibson influence appears in the machine's specificity and
    atmosphere, not just in superficial cyberpunk motifs.

------------------------------------------------------------------------

## North star

**Shaderverse is a machine for turning mathematical ideas into visual
phenomena---and turning visual curiosity into mathematical
understanding.**

It should feel like a device you discover in an unfamiliar research
station: intricate, beautiful, slightly uncanny, and powerful enough
that learning to operate it becomes an adventure.

The fiction invites the user in. The controls make experimentation
tangible. The mathematics makes the experience educational. The AI helps
bridge the distance between imagination and implementation.

The ultimate goal is not to hide the mathematics behind AI. It is to
make the mathematics inviting enough that the user wants to understand
it.
