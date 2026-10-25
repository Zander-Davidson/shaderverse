# Roadmap

*Part of the [Shaderverse design docs](README.md).*

Each version proves one thing before the next adds complexity. A small,
polished instrument with one excellent portal, a few meaningful
controls, and a clear loop is preferable to a large, unfinished cockpit.

## v1.0: the instrument (local, manual)

A Shadertoy-style tool presented as the cockpit. No users, no database
and no AI.

In scope:

-   The spherical cockpit with a fixed view and subtle curvature.
-   The shader portal, rendering in real time from the current code.
-   The curved code display, with a flat editor overlay for editing.
-   Live compilation, with errors on the correct lines and the last good
    shader still running.
-   Knobs created by selecting numeric literals in the editor and bound
    to `mainImage` parameters, with no recompile while a knob turns.
-   Knob range and label editing, baking and export.
-   Local autosave, project import and export, and starter examples.

Out of scope: AI, MIDI, mathematical explanations, camera movement,
Shadertoy texture channels and multipass buffers, vector and color
knobs, accounts and servers.

The build plan is in [the v1.0 implementation plan](implementation-plan-v1.0.md).

## v1.1: general-purpose agent

A single agent turns prompts into shaders and knobs. Basic workflow:

1.  The user enters a shader prompt. It can ask for a new shader, a
    change to the current shader, or only a change to the current
    shader's knobs.
2.  The agent uses an LLM to rewrite the prompt, including a plan for
    the knobs.
3.  The agent uses an LLM to generate the shader from the rewritten
    prompt.
4.  The GLSL appears in the editor.
5.  The shader starts playing in the portal.
6.  The agent generates knobs and connects them to the shader's inputs.
7.  The user adjusts knobs and the portal updates in real time.

The agent works through the same store actions and compile validator as
the user. When a shader fails to compile, it repairs and retries. It
creates knobs by writing them as `mainImage` parameters with metadata,
so its knobs behave exactly like hand-made ones. It can also thread
parameters into helper functions, which v1.0 cannot do by hand.

## v1.2: manager of agents

A manager coordinates specialized agents for a better experience and a
clearer separation of concerns. For example: a prompt planner, a shader
author, a compile-and-repair agent, a knob curator, and an explainer
that provides the mathematical explanations described in [Learning model](learning.md). The
action log gives them a shared history.

## v1.3: cohesive aesthetic

A cohesive interface aesthetic built around a word cloud or knowledge
graph of the concepts in play: techniques, mathematical ideas, knobs and
shaders. A natural home for it is the space outside the cockpit canopy.
The project format already reserves tags and concepts for this. Details
to be designed.

## v2.0: web service

A deployable web service with users and a database. The project JSON
format becomes the stored record, and the storage interface gets a
server-backed implementation.

## Not yet scheduled

-   [MIDI](midi.md).
-   The rest of the learning model ([Learning model](learning.md)): the three levels of
    understanding and prediction challenges, partly arriving with the
    v1.2 explainer.
-   Camera movement between regions of the cockpit.
-   An in-scene, curved code editor.
-   Vector and color knobs, and "replace all occurrences".
-   Rich biomechanical materials and peripheral systems, expected to
    grow alongside v1.3.

## Relationship to the earlier phase plan

The earlier six-phase MVP plan (portal, first control, console, AI
synthesis, mathematics, physical control) is superseded by this roadmap.
Phases 1 to 3 map to v1.0, phase 4 to v1.1 and v1.2, phase 5 to v1.2 and
later, and phase 6 is not yet scheduled.
