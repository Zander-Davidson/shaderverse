// Project format v1. The same document is used for autosave and for file
// import and export; later versions add migrations rather than new formats.

import type { KnobType } from '../source/mainImage';
import type { Quality } from '../shader/runtime';

export const SCHEMA_VERSION = 1;
export const KNOB_SLOTS = 8;

export interface KnobRecord {
  id: string;
  param: string;
  label: string;
  type: KnobType;
  value: number;
  default: number;
  min: number;
  max: number;
  step: number;
  slot: number;
  // Reserved for later versions; always null in v1.0.
  midi: null;
  intuition: null;
  mathematics: null;
  implementation: null;
  learningContext: null;
}

export interface Playback {
  playing: boolean;
  quality: Quality;
}

export interface Project {
  schemaVersion: number;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  source: string;
  knobs: KnobRecord[];
  playback: Playback;
  /** Reserved for the learning model (v1.2+). */
  learning: { concepts: string[]; notes: null };
}

export const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export function newProject(source: string, name = 'Untitled'): Project {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId(),
    name,
    createdAt: now,
    updatedAt: now,
    source,
    knobs: [],
    playback: { playing: true, quality: 'medium' },
    learning: { concepts: [], notes: null },
  };
}

/** Starting range for a new knob, from the literal it replaces. */
export function defaultRange(value: number, type: KnobType): { min: number; max: number; step: number } {
  let min: number;
  let max: number;
  if (value > 0) [min, max] = [0, value * 2];
  else if (value < 0) [min, max] = [value * 2, 0];
  else [min, max] = [-1, 1];
  if (type === 'int') {
    min = Math.floor(min);
    max = Math.ceil(max);
    if (max - min < 2) [min, max] = [min - 1, max + 1];
    return { min, max, step: 1 };
  }
  return { min, max, step: 0 };
}

export function makeKnob(param: string, type: KnobType, value: number, slot: number): KnobRecord {
  return {
    id: newId(),
    param,
    label: param,
    type,
    value,
    default: value,
    ...defaultRange(value, type),
    slot,
    midi: null,
    intuition: null,
    mathematics: null,
    implementation: null,
    learningContext: null,
  };
}

/** Migrations from version N to N+1, keyed by N. */
export const migrations: Record<number, (p: Record<string, unknown>) => Record<string, unknown>> = {};

export class ProjectFormatError extends Error {}

export function migrate(raw: unknown, steps = migrations): Project {
  if (!raw || typeof raw !== 'object') throw new ProjectFormatError('Not a project file.');
  let doc = raw as Record<string, unknown>;
  if (typeof doc.schemaVersion !== 'number') {
    throw new ProjectFormatError('The project has no schema version.');
  }
  let version: number = doc.schemaVersion;
  if (version > SCHEMA_VERSION) {
    throw new ProjectFormatError(`The project uses schema ${version}; this app reads up to ${SCHEMA_VERSION}.`);
  }
  while (version < SCHEMA_VERSION) {
    const step = steps[version];
    if (!step) throw new ProjectFormatError(`No migration from schema ${version}.`);
    doc = step(doc);
    version = typeof doc.schemaVersion === 'number' ? doc.schemaVersion : version + 1;
  }
  return validate(doc);
}

function validate(doc: Record<string, unknown>): Project {
  if (typeof doc.source !== 'string') throw new ProjectFormatError('The project has no shader source.');
  const base = newProject(doc.source, typeof doc.name === 'string' ? doc.name : 'Untitled');
  const knobs = Array.isArray(doc.knobs) ? doc.knobs : [];
  const playback = (doc.playback ?? {}) as Partial<Playback>;
  return {
    ...base,
    id: typeof doc.id === 'string' ? doc.id : base.id,
    createdAt: typeof doc.createdAt === 'string' ? doc.createdAt : base.createdAt,
    updatedAt: typeof doc.updatedAt === 'string' ? doc.updatedAt : base.updatedAt,
    playback: {
      playing: typeof playback.playing === 'boolean' ? playback.playing : true,
      quality: playback.quality === 'low' || playback.quality === 'high' ? playback.quality : 'medium',
    },
    knobs: knobs.filter(isKnobLike).map((k) => ({
      ...makeKnob(k.param, k.type, k.value, k.slot),
      ...k,
      midi: null,
      intuition: null,
      mathematics: null,
      implementation: null,
      learningContext: null,
    })),
  };
}

function isKnobLike(k: unknown): k is KnobRecord {
  if (!k || typeof k !== 'object') return false;
  const r = k as Record<string, unknown>;
  return (
    typeof r.param === 'string' &&
    (r.type === 'float' || r.type === 'int') &&
    typeof r.value === 'number' &&
    typeof r.slot === 'number'
  );
}
