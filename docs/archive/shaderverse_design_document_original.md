# SHADERVERSE

## Generative Field Synthesis System --- Design Document

**Working designation:** SHADERVERSE\
**System classification:** Interactive generative graphics instrument\
**Unit designation:** C/7a *(fictional hardware designation; inspired by
the specificity of William Gibson's imagined technology)*\
**Status:** Concept / early design\
**Primary platform:** Desktop browser

------------------------------------------------------------------------

## 1. Product vision

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

The outcome should feel less like receiving an answer from a chatbot and
more like discovering how to operate a powerful machine.

------------------------------------------------------------------------

## 2. Naming and fictional identity

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

## 3. Design philosophy: a fictional instrument, not a conventional app

The interface is a dynamically rendered, three-dimensional alien
console.

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

The result should be glossy, dark, organic, intricate, and slightly
uncanny.

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
attention.

**The AI belongs to the machine.** The AI companion should feel like a
subsystem of the instrument, not a chatbot pasted onto the side.

**Maximalism is intentional.** Rich textures, decorative markings,
luminous indicators, embedded mechanisms, and layered technical details
are welcome. Visual complexity should create a sense of mastery over an
esoteric system, not make essential controls impossible to understand.

------------------------------------------------------------------------

## 4. Spatial interface

The interface is a real-time 3D scene, not a static background with HTML
controls arranged over it.

### Central shader portal

A large circular display is embedded into the center of the console. It
functions as the main viewport for the active shader.

The portal should feel like a window into a synthetic environment or a
contained visual phenomenon. Its rim can feature layered mechanical
geometry, translucent materials, emissive channels, and intricate
surface details.

The shader itself should be the brightest, most visually compelling
element in the scene.

The user can continuously observe the result while manipulating
parameters elsewhere on the console.

### Radial parameter controls

The most important parameters appear in physical-feeling controls
surrounding the portal.

Possible forms include:

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

### Mathematical readout

A contextual mathematical display provides a deeper view into the active
parameter or operation.

It can reveal:

-   A plain-language explanation.
-   The mathematical expression.
-   Definitions of individual terms.
-   The corresponding GLSL expression.
-   Related concepts and suggested experiments.

This display is part of the same console. It should feel like the
machine is exposing its internal operating principles, not opening a
separate textbook.

### Code subsystem

The GLSL editor occupies a peripheral display integrated into the 3D
scene.

It should support ordinary code editing, syntax highlighting, error
feedback, and direct inspection of the shader. It can have the
appearance of a technical maintenance terminal without sacrificing
readability.

Code remains available at all times, but it should not dominate the
visual hierarchy.

### AI companion

The AI is represented by an abstract, luminous orb or other simple,
nonthreatening visual presence.

It should feel like an intelligence inhabiting the instrument: calm,
attentive, and capable. Its visual behavior can communicate whether it
is listening, reasoning, synthesizing, or reporting a problem.

The AI can communicate through short contextual messages, a focused
interaction area, and subtle animation. Avoid making a conventional chat
window the primary interface.

### Peripheral systems

Additional displays and controls can represent shader diagnostics,
parameter relationships, MIDI assignments, runtime status, and other
technical subsystems.

These elements should be added where they reinforce the experience or
provide real utility. The console should feel richly inhabited without
becoming a random collection of decorative widgets.

------------------------------------------------------------------------

## 5. Learning model

Shaderverse teaches mathematics through creative work rather than a
fixed curriculum.

The user begins with visual intent. The system turns that intent into a
working shader, then makes the important mathematical relationships
tangible and explorable.

### Three levels of understanding

When the user selects or investigates a parameter, expose three
connected levels.

**Level 1: Intuition**

Explain what the parameter does in visual language.

Example: "Controls how tightly packed the circular waves are."

**Level 2: Mathematics**

Show the relevant mathematical expression and explain its terms.

Example: Explain how scaling a coordinate before applying a periodic
function changes the spatial frequency of a pattern.

**Level 3: Implementation**

Show the corresponding GLSL expression and explain how the code
implements the mathematical relationship.

These levels should connect directly. The user should be able to move
from the visual effect to the equation and then to the code without
losing sight of the shader.

### Learning through manipulation

Every parameter interaction is an opportunity to learn.

The user can change a value, observe the result, and then discover why
the result occurred. The system should highlight relationships that are
useful for building future intuition.

Examples include:

-   Increasing spatial frequency and observing tighter repetition.
-   Changing the scale or origin of a coordinate system.
-   Comparing smooth interpolation with a hard threshold.
-   Exploring periodic functions and oscillation.
-   Discovering how distance fields can create shapes.
-   Introducing noise and observing how it changes regular structures.
-   Understanding domain repetition by manipulating tiled coordinates.

### Optional prediction challenges

Learning should be playful and contextual, not a mandatory quiz.

The system can occasionally invite the user to:

-   Predict what a parameter change will do.
-   Choose which of two equations produces a particular effect.
-   Modify a mathematical expression to achieve a visual goal.
-   Describe a desired change using mathematical terminology.
-   Explain why a pattern changed after an edit.

These challenges should appear when they naturally relate to the user's
work.

### Adaptive explanations

Explanations should respond to the user's current level of
understanding. Start with intuition, then reveal more detail when
requested or when the user demonstrates interest.

Avoid overwhelming a beginner with unexplained notation. Also avoid
permanently hiding mathematical precision behind oversimplified
metaphors.

The long-term objective is for users to acquire the vocabulary and
intuition to direct the system precisely.

------------------------------------------------------------------------

## 6. AI architecture and responsibilities

The AI should behave as a collection of coordinated capabilities within
the instrument rather than one undifferentiated chatbot.

### Shader synthesis

**Input:** A natural-language description of a desired visual effect.

**Responsibilities:** - Translate the request into a plausible shader
implementation. - Generate and revise GLSL. - Preserve existing work
where appropriate. - Identify important parameters and structural
choices. - Validate compilation and report errors. - Explain major
implementation decisions when useful.

### Parameter curation

After a shader is generated, a parameter-curation process identifies
which values are worth exposing as interactive controls.

It should prefer parameters that are:

-   Visually meaningful.
-   Useful for creative exploration.
-   Relatively safe to manipulate.
-   Educationally interesting.
-   Understandable through direct experimentation.

It should avoid exposing every numeric literal indiscriminately. The aim
is to create a useful instrument, not a wall of knobs.

### Mathematical explanation

The explainer connects visual behavior, mathematical concepts, and
implementation.

It should identify the relevant expression, explain the role of its
terms, and show how changes to those terms affect the rendered output.

### Creative guidance

The system can suggest adjacent experiments, interesting parameter
combinations, or alternate approaches to a visual goal.

Suggestions should expand the user's creative possibilities without
taking control away from them.

### Verification

Generated code must be tested in the actual rendering environment where
possible.

The system should detect compilation failures and relevant runtime
problems, and should distinguish verified behavior from an explanation
that is only theoretically plausible.

------------------------------------------------------------------------

## 7. Shader and parameter state

The console's visual controls are representations of application state.
They are not the source of truth.

Each parameter should have a stable identity and structured metadata so
it can be presented consistently in the 3D interface, mapped to MIDI,
explained by the AI, and connected to the appropriate shader expression.

A conceptual parameter record could include:

-   **ID:** Stable identifier.
-   **Name:** Human-readable label.
-   **Value:** Current value.
-   **Range:** Minimum, maximum, and any relevant step size.
-   **Default:** Initial value.
-   **Type:** Scalar, vector, color, boolean, or another supported type.
-   **Shader binding:** The uniform or expression the parameter
    controls.
-   **Intuition:** Plain-language description.
-   **Mathematics:** Relevant equation or concept.
-   **Implementation:** Corresponding GLSL expression or code reference.
-   **MIDI mapping:** Optional device, control, and mapping
    configuration.
-   **Learning context:** Related concepts, experiments, or explanatory
    material.

The exact schema can evolve during implementation.

The important architectural rule is that the shader, 3D controls, MIDI
mappings, and explanations all reference a shared, explicit model of
parameter state.

Changing a dial should update the parameter state, which updates the
shader and any related readouts. MIDI input should update that same
state. The mathematical display should derive its information from the
same parameter identity.

This avoids creating separate, inconsistent representations of the same
control.

------------------------------------------------------------------------

## 8. MIDI integration

Physical MIDI controllers are a natural extension of the instrument.

The user should be able to map an exposed shader parameter to a physical
knob or other supported MIDI control. Turning that knob should feel like
operating the corresponding control on the virtual console.

The system should support:

-   Discovering compatible MIDI devices.
-   Assigning a parameter to a physical control.
-   Displaying the current mapping.
-   Configuring ranges and response behavior.
-   Indicating active MIDI input.
-   Avoiding conflicting or ambiguous assignments.

The visual console and physical controller should remain synchronized
because they manipulate the same parameter state.

MIDI is an important part of the intended experience, but it does not
need to be a prerequisite for the first working prototype.

------------------------------------------------------------------------

## 9. Technical direction

### Recommended foundation

-   **React and TypeScript:** Application state, UI logic, and
    integration.
-   **Three.js with React Three Fiber:** The real-time 3D console,
    geometry, materials, lighting, and interaction.
-   **GLSL and WebGL:** Runtime execution of generated shaders.
-   **Spatially integrated HTML overlays:** Legible code, equations,
    labels, and other text that would be difficult to render directly as
    3D text.
-   **Web MIDI API:** Physical controller input where supported by the
    browser and operating system.
-   **AI services:** Shader generation, parameter curation, mathematical
    explanations, and creative assistance.

### Rendering architecture

The shader runs in its own rendering surface or dedicated rendering
pipeline. Its output is displayed as a texture on the central portal
inside the 3D scene.

The console itself is a separate 3D scene with its own geometry,
materials, lighting, and interaction system.

This separation allows the shader to change without rebuilding the
entire console and allows the console's presentation to evolve
independently of the generated visual content.

Text-heavy interfaces can use HTML layered and positioned in relation to
the 3D scene. Readability and editing quality take priority over forcing
every element to be rendered as a 3D object.

### State architecture

Maintain a central state model for the active shader, its parameters,
mappings, and associated learning information.

The 3D scene presents that state. It does not own the authoritative
values.

This distinction is especially important as the application grows: the
same parameter must remain consistent across virtual dials, MIDI
controls, shader uniforms, mathematical explanations, and AI operations.

### Practical constraints

The most difficult part is likely to be achieving polished, organic 3D
geometry, convincing glossy materials, reflections, and an intentional
composition---not simply rendering a 3D scene in a browser.

Start with a controlled visual scope and build up the console's
complexity incrementally.

Prioritize a stable rendering loop and clear interaction semantics
before attempting elaborate effects.

------------------------------------------------------------------------

## 10. MVP plan

The initial prototype should prove that the central experience is
compelling before the entire fictional machine is built.

### Phase 1: The portal

-   Render a shader in a browser.
-   Display it inside a circular portal.
-   Support live changes to a small set of shader parameters.
-   Establish the central rendering and state architecture.

### Phase 2: The first instrument control

-   Build one high-quality 3D dial.
-   Connect it to a real shader parameter.
-   Show immediate visual feedback.
-   Ensure the dial and shader share the same underlying state.

### Phase 3: The console

-   Establish the dark, glossy, biomechanical material language.
-   Build radial control placements around the portal.
-   Add spatially integrated labels and technical readouts.
-   Establish lighting, depth, and the sense of a single coherent
    object.

### Phase 4: AI synthesis

-   Allow a user to describe a visual effect.
-   Generate a shader and compile it.
-   Identify a small, useful set of parameters.
-   Populate the console with controls for those parameters.
-   Provide contextual explanations.

### Phase 5: Mathematics

-   Connect parameters to mathematical explanations.
-   Show the relevant equation and GLSL expression.
-   Add simple, optional experiments that build intuition.

### Phase 6: Physical control and refinement

-   Add MIDI discovery and mapping.
-   Synchronize physical and virtual controls.
-   Improve the console's organic geometry, materials, and interactions.
-   Add peripheral systems only when they contribute to the experience.

A small, polished instrument with one excellent portal, a few meaningful
controls, and a clear learning loop is preferable to a large, unfinished
console.

------------------------------------------------------------------------

## 11. Success criteria

Shaderverse succeeds when it feels like a coherent creative instrument
rather than a collection of software features.

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
    console.
-   Mathematics and code are accessible without interrupting creative
    flow.
-   Virtual controls, MIDI, and shader output remain synchronized.

### Identity success

-   The system feels like a particular piece of fictional technology.
-   Its visual language is distinctive without sacrificing usability.
-   The Gibson influence appears in the machine's specificity and
    atmosphere, not just in superficial cyberpunk motifs.

------------------------------------------------------------------------

## 12. North star

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
