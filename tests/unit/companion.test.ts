import { describe, expect, it } from 'vitest';
import {
  Attention,
  Blinker,
  BLINK_GAP,
  BODY_EXTENT,
  bodyLobes,
  Gaze,
  GAZE_LIMIT,
  gazeToward,
  Pupil,
  springStep,
} from '../../src/companion/behavior';
import { choosePerch, isClear, type KeepOut } from '../../src/companion/perch';

/** A repeatable random source. */
function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

describe('blinking', () => {
  it('blinks every few seconds, briefly, and is otherwise open', () => {
    const b = new Blinker(seeded(3));
    const starts: number[] = [];
    let shut = false;
    let closedTime = 0;
    const dt = 1 / 240;
    for (let t = 0; t < 60; t += dt) {
      const lid = b.lid(t);
      expect(lid).toBeGreaterThanOrEqual(0);
      expect(lid).toBeLessThanOrEqual(1);
      if (lid > 0.5) closedTime += dt;
      if (lid > 0.9 && !shut) starts.push(t);
      shut = lid > 0.9;
    }
    // Every 3 to 8 seconds, plus the odd double blink.
    expect(starts.length).toBeGreaterThanOrEqual(60 / BLINK_GAP[1]);
    expect(starts.length).toBeLessThanOrEqual((60 / BLINK_GAP[0]) * 2);
    // Shut for well under a tenth of the time.
    expect(closedTime / 60).toBeLessThan(0.05);
  });

  it('blinks on request', () => {
    const b = new Blinker(seeded(), 0);
    b.blink(0.5);
    expect(b.lid(0.55)).toBeGreaterThan(0.5);
    expect(b.lid(1)).toBe(0);
  });
});

describe('gaze', () => {
  it('follows a target a beat behind, then settles on it', () => {
    const g = new Gaze(() => 0.5, 0);
    g.update(0.05, 0.05, 0.5, 0);
    expect(g.x).toBeGreaterThan(0);
    expect(g.x).toBeLessThan(0.5);
    for (let t = 0.05; t < 1.5; t += 1 / 60) g.update(t, 1 / 60, 0.5, 0);
    expect(g.x).toBeCloseTo(0.5, 2);
  });

  it('never turns past the limit', () => {
    const g = new Gaze(seeded(), 0);
    for (let t = 0; t < 10; t += 1 / 60) {
      g.update(t, 1 / 60, 5, 5);
      expect(Math.hypot(g.x, g.y)).toBeLessThanOrEqual(GAZE_LIMIT + 0.05);
    }
  });

  it('turns farther toward points farther away on screen', () => {
    const near = Math.hypot(...gazeToward(60, 0, 40));
    const far = Math.hypot(...gazeToward(400, 0, 40));
    expect(near).toBeLessThan(far);
    expect(far).toBeLessThanOrEqual(GAZE_LIMIT);
    expect(gazeToward(0, 0, 40)).toEqual([0, 0]);
    // Up on screen (positive dy) looks up.
    expect(gazeToward(0, 300, 40)[1]).toBeGreaterThan(0);
  });
});

describe('pupil', () => {
  it('widens on interest and narrows slowly back', () => {
    const p = new Pupil();
    const rest = p.update(0);
    p.interest(1);
    const wide = p.update(0.016);
    expect(wide).toBeGreaterThan(rest + 0.5);
    let v = wide;
    for (let i = 0; i < 60; i++) v = p.update(0.016);
    expect(v).toBeLessThan(wide);
    expect(v).toBeGreaterThan(rest);
    for (let i = 0; i < 600; i++) v = p.update(0.016);
    expect(v).toBeCloseTo(rest, 2);
  });
});

describe('body', () => {
  const still = { vx: 0, vy: 0, vz: 0, squish: 0, animate: true };

  it('stays within its extent while it throbs', () => {
    for (let t = 0; t < 600; t += 0.05) {
      for (const l of bodyLobes(t, still))
        expect(Math.hypot(l.x, l.y, l.z) + l.r).toBeLessThanOrEqual(BODY_EXTENT);
    }
  });

  it('changes shape over time, unless motion is reduced', () => {
    const a = bodyLobes(0, still);
    const b = bodyLobes(2, still);
    expect(a[1]!.x).not.toBeCloseTo(b[1]!.x, 3);
    const frozen = { ...still, animate: false };
    expect(bodyLobes(0, frozen)).toEqual(bodyLobes(2, frozen));
  });

  it('trails a droplet behind it while moving', () => {
    const lobes = bodyLobes(0, { ...still, vx: 4 });
    const drop = lobes[lobes.length - 1]!;
    expect(drop.r).toBeGreaterThan(0);
    expect(drop.x).toBeLessThan(0);
    expect(bodyLobes(0, still).at(-1)!.r).toBe(0);
  });

  it('squashes flatter and wider on a squish', () => {
    const plain = bodyLobes(1, still);
    const squashed = bodyLobes(1, { ...still, squish: 0.3 });
    const height = (ls: typeof plain) => Math.max(...ls.map((l) => Math.abs(l.y) + l.r));
    expect(height(squashed)).toBeLessThan(height(plain) + 0.1);
    expect(Math.abs(squashed[1]!.y)).toBeLessThan(Math.abs(plain[1]!.y));
  });

  it('springs settle on their target', () => {
    let x = 0;
    let v = 0;
    for (let i = 0; i < 300; i++) [x, v] = springStep(x, v, 1, 5, 0.6, 1 / 60);
    expect(x).toBeCloseTo(1, 3);
  });
});

describe('attention', () => {
  const view = (v: 'neutral' | 'left' | 'right' | 'lean') => ({
    view: v,
    hovered: false,
    pointerOn: true,
    dragging: false,
  });

  it('watches the user sitting back, the cursor to a side, the portal leaned in', () => {
    const a = new Attention(() => 0.99, 0);
    expect(a.focus(1, view('neutral'))).toEqual({ kind: 'user' });
    expect(a.focus(1, view('left'))).toEqual({ kind: 'pointer' });
    expect(a.focus(1, view('lean'))).toEqual({ kind: 'portal' });
    expect(a.focus(1, { ...view('lean'), dragging: true })).toEqual({ kind: 'pointer' });
    expect(a.focus(1, { ...view('neutral'), hovered: true })).toEqual({ kind: 'pointer' });
  });

  it('glances at a turned knob, then looks back', () => {
    const a = new Attention(() => 0.99, 0);
    a.knobTurned(2, 3);
    expect(a.focus(2.5, view('neutral'))).toEqual({ kind: 'knob', slot: 3 });
    expect(a.focus(4, view('neutral'))).toEqual({ kind: 'user' });
  });

  it('glances away now and then on its own', () => {
    const a = new Attention(seeded(5), 0);
    const seen = new Set<string>();
    for (let t = 0; t < 120; t += 0.1) seen.add(a.focus(t, view('neutral')).kind);
    expect(seen.has('user')).toBe(true);
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('perches', () => {
  const zones: KeepOut = {
    circles: [{ x: 500, y: 300, r: 150 }],
    boxes: [{ left: 0, top: 0, right: 200, bottom: 600 }],
  };

  it('rejects spots that touch a zone or leave the screen', () => {
    expect(isClear({ x: 700, y: 100, r: 30 }, zones, 1000, 600, 10)).toBe(true);
    expect(isClear({ x: 500, y: 120, r: 30 }, zones, 1000, 600, 10)).toBe(false);
    expect(isClear({ x: 230, y: 100, r: 30 }, zones, 1000, 600, 10)).toBe(false);
    expect(isClear({ x: 990, y: 100, r: 30 }, zones, 1000, 600, 10)).toBe(false);
  });

  it('takes the first clear candidate', () => {
    const c = choosePerch(
      [
        { x: 500, y: 300, r: 30 },
        { x: 800, y: 500, r: 30 },
        { x: 700, y: 100, r: 30 },
      ],
      zones,
      1000,
      600,
      10,
    );
    expect(c).toEqual({ x: 800, y: 500, index: 1 });
  });

  it('peeks in from the nearest edge when nothing is clear', () => {
    const c = choosePerch([{ x: 500, y: 140, r: 40 }], zones, 1000, 600, 10);
    expect(c.index).toBe(-1);
    expect(c.edge).toBe('top');
    expect(c.x).toBe(500);
    expect(c.y).toBeGreaterThan(0);
    expect(c.y).toBeLessThan(40);
  });
});
