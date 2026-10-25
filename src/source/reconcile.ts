// The signature declares the knobs. After every source change, bring the
// knob list in line with the mainImage parameters.

import type { KnobType } from './mainImage';
import { KNOB_SLOTS, makeKnob, type KnobRecord } from '../project/schema';

export interface ReconcileResult {
  knobs: KnobRecord[];
  /** Knobs that left the signature; kept for the session so undo restores them. */
  removed: KnobRecord[];
}

export function reconcile(
  params: { name: string; type: KnobType }[],
  knobs: KnobRecord[],
  graveyard: Map<string, KnobRecord>,
  /** Metadata for knobs being created by this change, keyed by parameter. */
  pending: Map<string, KnobRecord> = new Map(),
): ReconcileResult {
  const byParam = new Map(knobs.map((k) => [k.param, k]));
  const wanted = new Set(params.map((p) => p.name));
  const removed = knobs.filter((k) => !wanted.has(k.param));
  const kept: KnobRecord[] = [];
  const used = new Set<number>();

  // Existing knobs keep their slots, so first collect them.
  for (const p of params) {
    const k = byParam.get(p.name);
    if (k) {
      const typed = k.type === p.type ? k : retype(k, p.type);
      kept.push(typed);
      used.add(typed.slot);
    }
  }

  const freeSlot = (preferred?: number) => {
    if (preferred !== undefined && preferred >= 0 && preferred < KNOB_SLOTS && !used.has(preferred)) {
      used.add(preferred);
      return preferred;
    }
    for (let s = 0; s < KNOB_SLOTS; s++) {
      if (!used.has(s)) {
        used.add(s);
        return s;
      }
    }
    return -1;
  };

  const result: KnobRecord[] = [];
  for (const p of params) {
    const existing = kept.find((k) => k.param === p.name);
    if (existing) {
      result.push(existing);
      continue;
    }
    const prior = pending.get(p.name) ?? graveyard.get(p.name);
    const slot = freeSlot(prior?.slot);
    const base = prior && prior.type === p.type ? prior : makeKnob(p.name, p.type, 0, slot);
    // Knobs beyond the available slots still bind (slot -1) but are not shown.
    result.push({ ...base, param: p.name, slot });
  }
  return { knobs: result, removed };
}

function retype(k: KnobRecord, type: KnobType): KnobRecord {
  if (type === 'float') return { ...k, type, step: 0 };
  const r = (n: number) => Math.round(n);
  return { ...k, type, value: r(k.value), default: r(k.default), min: r(k.min), max: r(k.max), step: 1 };
}
