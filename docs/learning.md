# Learning model

*Part of the [Shaderverse design docs](README.md).*

Shaderverse teaches mathematics through creative work rather than a
fixed curriculum.

The user begins with visual intent. The system turns that intent into a
working shader, then makes the important mathematical relationships
tangible and explorable.

## Three levels of understanding

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

## Learning through manipulation

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

## Optional prediction challenges

Learning should be playful and contextual, not a mandatory quiz.

The system can occasionally invite the user to:

-   Predict what a parameter change will do.
-   Choose which of two equations produces a particular effect.
-   Modify a mathematical expression to achieve a visual goal.
-   Describe a desired change using mathematical terminology.
-   Explain why a pattern changed after an edit.

These challenges should appear when they naturally relate to the user's
work.

## Adaptive explanations

Explanations should respond to the user's current level of
understanding. Start with intuition, then reveal more detail when
requested or when the user demonstrates interest.

Avoid overwhelming a beginner with unexplained notation. Also avoid
permanently hiding mathematical precision behind oversimplified
metaphors.

The long-term objective is for users to acquire the vocabulary and
intuition to direct the system precisely.
