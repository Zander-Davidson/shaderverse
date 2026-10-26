# AI architecture and responsibilities

*Part of the [Shaderverse design docs](README.md).*

The AI should behave as a collection of coordinated capabilities within
the instrument rather than one undifferentiated chatbot.

**Roadmap:** there is no AI in v1.0. v1.1 introduces a single
general-purpose agent, and v1.2 splits the work across a manager of
specialized agents ([Roadmap](roadmap.md)). The capabilities below describe the end
state.

The AI's presence in the cockpit, its body, gaze and how it shows its
state, is specified in [Companion](companion.md).

## Shader synthesis

**Input:** A natural-language description of a desired visual effect.

**Responsibilities:**

-   Translate the request into a plausible shader implementation.
-   Generate and revise GLSL.
-   Preserve existing work where appropriate.
-   Identify important parameters and structural choices.
-   Validate compilation and report errors.
-   Explain major implementation decisions when useful.

## Parameter curation

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

## Mathematical explanation

The explainer connects visual behavior, mathematical concepts, and
implementation.

It should identify the relevant expression, explain the role of its
terms, and show how changes to those terms affect the rendered output.

## Creative guidance

The system can suggest adjacent experiments, interesting parameter
combinations, or alternate approaches to a visual goal.

Suggestions should expand the user's creative possibilities without
taking control away from them.

## Verification

Generated code must be tested in the actual rendering environment where
possible.

The system should detect compilation failures and relevant runtime
problems, and should distinguish verified behavior from an explanation
that is only theoretically plausible.

## How agents work with the app

-   Agents change the project through the same store actions as the
    user ([Knobs and state](knobs-and-state.md)), recorded in the action log with the agent as the
    actor.
-   Agents compile through the same validator the editor uses, and use
    its structured errors to repair code.
-   Agents expose knobs the same way the user does: as `mainImage`
    parameters plus knob metadata. Reconciliation turns them into knobs,
    so there is one knob system, not two.
-   A knob-only request (for example "give me a knob for the ring
    width") is a source edit that adds, removes or renames parameters,
    plus metadata changes.
