# MIDI integration

*Part of the [Shaderverse design docs](README.md).*

**Roadmap:** not yet scheduled. Knobs have stable IDs and live in the
shared project state ([Knobs and state](knobs-and-state.md)), so MIDI can bind to them later without
changing the knob model.

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
