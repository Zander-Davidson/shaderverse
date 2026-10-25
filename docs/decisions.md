# Decision log

*Part of the [Shaderverse design docs](README.md).*

Decisions made on 2026-10-25 while defining v1.0.

| Topic | Decision | Reason |
|---|---|---|
| Interface | Fully 3D, built with plain Three.js. No React or React Three Fiber. | A single bespoke scene with no DOM interface to manage |
| Point of view | Inside a large sphere, camera near the wall, fixed view | Subtle but noticeable curvature; everything in one view to start |
| Curvature | Real curved geometry, no lens post-process | Exact pointer picking; room for lighting and reflections later |
| Code editing | Curved read-only display plus a flat CodeMirror overlay on click | A self-rendered 3D editor is a large project; this keeps v1.0 shippable |
| Text entry | Flat overlays (editor, knob popover, later prompts) | Legibility and normal keyboard behavior |
| Knob binding | Extra `mainImage` parameters, passed from uniforms by a hidden wrapper | No recompile while a knob turns; the source stays the single truth |
| Knob naming | One named parameter per knob | Readable code and self-labeling knobs |
| Knob declaration | The signature decides which knobs exist; metadata lives in the project file, keyed by parameter name | Code edits and the knob list cannot drift apart |
| Knob scope (v1.0) | Literals inside `mainImage` only; helper functions handled by the v1.1 agent | Parameters are not visible in helper functions |
| Repeated values | Only the selected occurrence becomes a knob | Predictable; "replace all" later |
| Deleting a knob | Bakes the current value into the code | Removing a control never changes the image |
| Compatibility | Shadertoy `mainImage` and standard uniforms; single pass, no texture channels | Existing single-pass shaders can be pasted in |
| Persistence | Browser autosave plus file import and export; versioned JSON project format | No backend until v2.0 |

## Open questions

-   Number and arrangement of knob slots around the portal.
-   Default range for a new knob (a starting heuristic is in the
    implementation plan).
-   Font, size and texture resolution for the code display, decided by
    legibility testing.
-   Final sphere radius, eye distance and field of view, decided by eye.
-   How API keys are handled when AI arrives in v1.1.
