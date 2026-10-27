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

Decisions made on 2026-10-26 about the AI companion ([Companion](companion.md)).

| Topic | Decision | Reason |
|---|---|---|
| Companion form | A floating, throbbing glob of gel with a single eye, replacing the abstract luminous orb | An alien intelligence inside a human machine; disturbing and friendly at once, after *Cruelty Squad*'s living interface |
| Placement | Floats free of the wall, at perches chosen per view, outside keep-out zones for every panel, the portal, knobs, tubing and overlays | It must never cover the work or block a click |
| View behavior | Neutral: looks at the user. Side focus: follows into view and tracks the cursor. Leaned in: leans in and watches the portal, glancing at knobs | Its attention mirrors the user's |
| State display | The throb and gaze are the AI's status display; problems make it deform and pulse faster, never frantically | State without labels |
| Sequencing | The body ships before the v1.1 agent | It depends only on the camera, layout and pointer |

Decisions made on 2026-10-26 about the cockpit layout ([The hanging rig](hanging-rig.md)).

| Topic | Decision | Reason |
|---|---|---|
| Camera distance | Pull the camera back and scale the portal up to keep its size on screen, keeping the field of view | Opens up the cockpit; a dolly zoom would flatten the depth |
| Panels | Monitors hung from the ceiling on posed, articulated arms, closer to the camera than the portal | Depth and parallax; a cockpit the pilot has arranged for themselves, after *The Matrix* |
| Monitor glass | Convex, reflective CRT-like glass in thin cases with chrome bezels | CRT character without the bulk; chrome keeps the house style |
| Console | Drop the unibody chrome console and the knob tubing | The hanging pieces replace it; separate pieces give more room to play with depth |
| Knob slots | Eight slots in the top row of a hanging control console, just below the portal on screen | Settles the open question on knob arrangement; keeps knobs near the portal |
| Knob-to-code link | Color tint and hover highlighting instead of tubes | The tubes go with the console |

## Open questions

-   Default range for a new knob (a starting heuristic is in the
    implementation plan).
-   Font, size and texture resolution for the code display, decided by
    legibility testing.
-   Final sphere radius, eye distance and field of view, decided by eye.
-   How API keys are handled when AI arrives in v1.1.
-   The companion's name, color, home perch and size ([Companion](companion.md)).
