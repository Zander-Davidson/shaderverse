import { makeKnob, newProject, type KnobRecord, type Project } from '../src/project/schema';
import type { KnobType } from '../src/source/mainImage';
import rings from './rings.glsl?raw';
import tiles from './tiles.glsl?raw';
import noise from './noise.glsl?raw';
import orbits from './orbits.glsl?raw';

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
  ]),
  example('Tiles', tiles, [
    { param: 'scale', value: 8, min: 1, max: 24 },
    { param: 'drift', value: 1, min: -4, max: 4 },
    { param: 'thickness', value: 0.04, min: -0.05, max: 0.3 },
    { param: 'hueSpread', value: 0.3, min: 0, max: 1, label: 'hue spread' },
    { param: 'pulse', value: 1, min: 0, max: 6 },
  ]),
  example('Noise field', noise, [
    { param: 'zoom', value: 3, min: 0.5, max: 10 },
    { param: 'warp', value: 4, min: 0, max: 10 },
    { param: 'flow', value: 0.12, min: -1, max: 1 },
    { param: 'octaves', type: 'int', value: 6, min: 1, max: 8 },
    { param: 'bright', value: 0.8, min: 0, max: 2 },
  ]),
  example('Orbits', orbits, [
    { param: 'bodies', type: 'int', value: 7, min: 1, max: 16 },
    { param: 'spread', value: 0.12, min: 0.02, max: 0.3 },
    { param: 'orbitSpeed', value: 1.2, min: -4, max: 4, label: 'orbit speed' },
    { param: 'glow', value: 0.004, min: 0, max: 0.015 },
    { param: 'sunSize', value: 0.05, min: 0, max: 0.2, label: 'sun size' },
  ]),
];
