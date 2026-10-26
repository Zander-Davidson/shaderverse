# SHADERVERSE

## Generative Field Synthesis System --- Design Docs

**Working designation:** SHADERVERSE\
**System classification:** Interactive generative graphics instrument\
**Unit designation:** C/7a *(fictional hardware designation; inspired by
the specificity of William Gibson's imagined technology)*\
**Status:** v1.0 implemented (see the repository README)\
**Primary platform:** Desktop browser (v1.0 runs locally, with no
backend)

> **Shaderverse is a machine for turning mathematical ideas into visual
> phenomena---and turning visual curiosity into mathematical
> understanding.**

## Documents

| Document | What it covers |
|---|---|
| [Vision and identity](vision.md) | Product vision, naming and fiction, design philosophy, success criteria, north star |
| [UI](ui.md) | The spherical cockpit: geometry, fixed view, portal, code display and editor overlay, knobs, readouts, reference interfaces |
| [Knobs and state](knobs-and-state.md) | The project store, knobs as `mainImage` parameters, reconciliation, what can become a knob, project format |
| [Architecture](architecture.md) | Stack, module boundaries, panel system, rendering, overlays, persistence |
| [AI](ai.md) | Agent capabilities and how agents work with the app (v1.1 and later) |
| [Learning model](learning.md) | The three levels of understanding, prediction challenges, adaptive explanations |
| [MIDI](midi.md) | Physical controller integration (not yet scheduled) |
| [Roadmap](roadmap.md) | v1.0 through v2.0, and what is not yet scheduled |
| [Decision log](decisions.md) | Decisions made so far, with reasons, and open questions |
| [v1.0 implementation plan](implementation-plan-v1.0.md) | Milestones, tests, acceptance checklist and risks for v1.0 |

## Where to start

-   **New to the project:** [Vision and identity](vision.md), then
    [UI](ui.md).
-   **Building v1.0:** [Roadmap](roadmap.md) for scope, then
    [Architecture](architecture.md), [Knobs and
    state](knobs-and-state.md) and the [implementation
    plan](implementation-plan-v1.0.md).
-   **Why something is the way it is:** [Decision log](decisions.md).

The original single-file design document, as it was before the v1.0
decisions, is kept in [archive](archive/shaderverse_design_document_original.md).
