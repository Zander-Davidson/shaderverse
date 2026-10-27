// Example shaders are written with the shader standard library
// (src/shader/stdlib.ts) wherever one of its functions fits: reciprocal(x)
// rather than 1.0 / x, wave(x) rather than 0.5 + 0.5 * cos(x), and so on.
// New examples should do the same, so every shape can be hovered and plotted.

import { makeKnob, newProject, type KnobRecord, type Project } from '../src/project/schema';
import type { KnobType } from '../src/source/mainImage';
import rings from './rings.glsl?raw';
import turing from './turing.glsl?raw';
import noise from './noise.glsl?raw';
import orbits from './orbits.glsl?raw';
import biomech from './biomech.glsl?raw';
import gel from './gel.glsl?raw';
import redmachine from './redmachine.glsl?raw';
import wisp from './wisp.glsl?raw';
import halftoneChrome from './halftonechrome.glsl?raw';
import starseed from './starseed.glsl?raw';

export interface Example {
  name: string;
  create: () => Project;
}

interface KnobSpec {
  param: string;
  type?: KnobType;
  /** Starting value; also the default. Matches the literal the knob replaced. */
  value: number;
  min: number;
  max: number;
  step?: number;
  label?: string;
}

/** Builds a project whose knobs fill slots in order. */
function example(name: string, source: string, specs: KnobSpec[]): Example {
  return {
    name,
    create: () => {
      const p = newProject(source, name);
      p.knobs = specs.map((s, slot): KnobRecord => {
        const type = s.type ?? 'float';
        const k = makeKnob(s.param, type, s.value, slot);
        return { ...k, min: s.min, max: s.max, step: s.step ?? k.step, label: s.label ?? s.param };
      });
      return p;
    },
  };
}

export const EXAMPLES: Example[] = [
  example('Rings', rings, [
    { param: 'ringFreq', value: 18, min: 2, max: 40, label: 'ring freq' },
    { param: 'speed', value: 2, min: -6, max: 6 },
    { param: 'wobble', value: 0.4, min: 0, max: 2 },
    { param: 'lobes', type: 'int', value: 3, min: 0, max: 12, label: 'lobes' },
    { param: 'falloff', value: 1.4, min: 0.4, max: 3 },
    { param: 'ringHue', value: 0, min: 0, max: 1, label: 'ring hue' },
    { param: 'crestHue', value: 0, min: 0, max: 1, label: 'crest hue' },
    { param: 'crest', value: 0.6, min: 0, max: 2 },
  ]),
  example('Turing', turing, [
    { param: 'scale', value: 9, min: 2, max: 30 },
    { param: 'morph', value: -0.2, min: -1.2, max: 1.2 },
    { param: 'waves', type: 'int', value: 14, min: 3, max: 32 },
    { param: 'chaos', value: 1, min: 0, max: 1 },
    { param: 'flow', value: 0.4, min: 0, max: 3 },
    { param: 'variety', value: 0.6, min: 0, max: 1.5 },
    { param: 'hue', value: 0, min: 0, max: 1 },
    { param: 'gloss', value: 1, min: 0, max: 2 },
  ]),
  example('Noise field', noise, [
    { param: 'zoom', value: 3, min: 0.5, max: 10 },
    { param: 'warp', value: 4, min: 0, max: 10 },
    { param: 'flow', value: 0.12, min: -1, max: 1 },
    { param: 'octaves', type: 'int', value: 6, min: 1, max: 8 },
    { param: 'bright', value: 0.8, min: 0, max: 2 },
    { param: 'waterHue', value: 0, min: 0, max: 1, label: 'water hue' },
    { param: 'crestHue', value: 0, min: 0, max: 1, label: 'crest hue' },
    { param: 'sat', value: 1, min: 0, max: 2, label: 'saturation' },
  ]),
  example('Orbits', orbits, [
    { param: 'bodies', type: 'int', value: 7, min: 1, max: 16 },
    { param: 'spread', value: 0.12, min: 0.02, max: 0.3 },
    { param: 'orbitSpeed', value: 1.2, min: -4, max: 4, label: 'orbit speed' },
    { param: 'glow', value: 0.004, min: 0, max: 0.015 },
    { param: 'sunSize', value: 0.05, min: 0, max: 0.2, label: 'sun size' },
  ]),
  // Styles after the cockpit's references: alien chrome skins, gel LCD
  // consoles, maximal red machinery, wispy halftone prints, and a blend.
  example('Biomech', biomech, [
    { param: 'twist', value: 0.35, min: 0, max: 1.5 },
    { param: 'thickness', value: 0.22, min: 0.05, max: 0.5 },
    { param: 'speed', value: 1, min: -3, max: 3 },
    { param: 'ribs', type: 'int', value: 6, min: 1, max: 16 },
    { param: 'sheen', value: 0.8, min: 0, max: 1 },
  ]),
  example('Gel Console', gel, [
    { param: 'blobs', type: 'int', value: 7, min: 1, max: 16 },
    { param: 'goo', value: 3, min: 0.5, max: 6 },
    { param: 'gloss', value: 1, min: 0, max: 2 },
    { param: 'flow', value: 0.6, min: 0, max: 2 },
    { param: 'hue', value: 0.3, min: 0, max: 1 },
    { param: 'grid', value: 1, min: 0, max: 4 },
    { param: 'refraction', value: 0.6, min: 0, max: 2, label: 'refract' },
  ]),
  example('Red Machine', redmachine, [
    { param: 'thickness', value: 0.14, min: 0.04, max: 0.26 },
    { param: 'frenzy', value: 0.35, min: 0, max: 1 },
    { param: 'density', value: 0.28, min: 0.05, max: 0.9 },
    { param: 'lacquer', value: 1, min: 0, max: 2 },
    { param: 'speed', value: 0.5, min: -2, max: 2 },
    { param: 'sway', value: 1, min: 0, max: 4 },
  ]),
  example('Wisp', wisp, [
    { param: 'folds', type: 'int', value: 3, min: 1, max: 12 },
    { param: 'wisp', value: 6, min: 1, max: 20 },
    { param: 'bloom', value: 0.9, min: 0.2, max: 2 },
    { param: 'dotSize', value: 4, min: 2, max: 12, label: 'dot size' },
    { param: 'drift', value: 0.08, min: 0, max: 0.5 },
  ]),
  example('Halftone Chrome', halftoneChrome, [
    { param: 'folds', type: 'int', value: 4, min: 1, max: 12 },
    { param: 'petal', value: 1.2, min: 0, max: 2 },
    { param: 'chrome', value: 0.6, min: 0, max: 1 },
    { param: 'dotSize', value: 5, min: 2, max: 14, label: 'dot size' },
    { param: 'glow', value: 1, min: 0.2, max: 3 },
    { param: 'hue', value: 0, min: 0, max: 1 },
    { param: 'twist', value: 0, min: -3, max: 3 },
    { param: 'separation', value: 0, min: 0, max: 1, label: 'separation' },
  ]),
  // Everything above at once: cosmos, chrome, biomech lattice and gel glow.
  example('Starseed', starseed, [
    { param: 'lattice', value: 6, min: 2, max: 14 },
    { param: 'struts', value: 0.45, min: 0.1, max: 1.1 },
    { param: 'twist', value: 0.8, min: -3, max: 3 },
    { param: 'core', value: 1, min: 0, max: 3 },
    { param: 'pulsar', value: 1, min: 0, max: 3 },
    { param: 'iridescence', value: 0.7, min: 0, max: 1 },
    { param: 'hue', value: 0, min: 0, max: 1 },
    { param: 'spin', value: 0.2, min: -2, max: 2 },
  ]),
];
