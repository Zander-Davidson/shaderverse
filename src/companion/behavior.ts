// The companion's behavior: blinking, gaze, pupil, throb and the shape of its
// body. Plain functions of time and inputs, with no three.js or DOM, so they
// can be unit tested. See docs/companion.md.

import { KNOB_SLOTS } from '../project/schema';

/** A random source in [0, 1); injectable so tests are deterministic. */
export type Rng = () => number;

const between = (rng: Rng, lo: number, hi: number) => lo + (hi - lo) * rng();
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Seconds between spontaneous blinks. */
export const BLINK_GAP: [number, number] = [3, 8];
/** Seconds one blink lasts. */
export const BLINK_LEN: [number, number] = [0.12, 0.18];
/** Chance a blink is followed by a second one. */
const DOUBLE_CHANCE = 0.2;

/**
 * Schedules blinks: every few seconds, sometimes doubled. The lid is a
 * membrane that sweeps across and back, so closure rises fast and falls a
 * little slower.
 */
export class Blinker {
  private windows: { start: number; len: number }[] = [];
  private next: number;

  constructor(
    private readonly rng: Rng,
    now = 0,
  ) {
    this.next = now + between(rng, ...BLINK_GAP);
  }

  /** Blinks now; `long` holds it shut a moment (success, a click). */
  blink(now: number, long = false): void {
    this.windows.push({ start: now, len: long ? 0.42 : between(this.rng, ...BLINK_LEN) });
    this.next = Math.max(this.next, now + between(this.rng, ...BLINK_GAP));
  }

  /** Lid closure at `now`: 0 open, 1 shut. Call with increasing times. */
  lid(now: number): number {
    if (now >= this.next) {
      const len = between(this.rng, ...BLINK_LEN);
      this.windows.push({ start: this.next, len });
      if (this.rng() < DOUBLE_CHANCE)
        this.windows.push({ start: this.next + len + 0.08, len: between(this.rng, ...BLINK_LEN) });
      this.next += between(this.rng, ...BLINK_GAP);
    }
    let lid = 0;
    this.windows = this.windows.filter((w) => now < w.start + w.len);
    for (const w of this.windows) {
      const t = (now - w.start) / w.len;
      if (t < 0) continue;
      // Shut by 40% of the way through, then open again.
      lid = Math.max(lid, t < 0.4 ? t / 0.4 : 1 - (t - 0.4) / 0.6);
    }
    return lid;
  }
}

/** Damped spring toward a target, stepped finely enough to stay stable. */
export function springStep(
  x: number,
  v: number,
  target: number,
  omega: number,
  zeta: number,
  dt: number,
): [number, number] {
  const steps = Math.max(1, Math.ceil(dt * 240));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    v += (omega * omega * (target - x) - 2 * zeta * omega * v) * h;
    x += v * h;
  }
  return [x, v];
}

/** How far the eye can turn from facing the camera (sine of the angle). */
export const GAZE_LIMIT = 0.85;

/**
 * Where the eye looks, as the sideways components of its direction in view
 * space: (0, 0) faces the camera, larger values turn it toward a point on
 * screen. Follows the target with a damped spring a beat behind, and jumps in
 * small saccades now and then so it looks rather than tracks.
 */
export class Gaze {
  x = 0;
  y = 0;
  private vx = 0;
  private vy = 0;
  private ox = 0;
  private oy = 0;
  private nextSaccade: number;
  private snapUntil = -1;
  /** Saccades per second relative to normal; leaned in it wanders more. */
  restlessness = 1;

  constructor(
    private readonly rng: Rng,
    now = 0,
  ) {
    this.nextSaccade = now + between(rng, 0.8, 2.6);
  }

  update(now: number, dt: number, tx: number, ty: number): void {
    if (now >= this.nextSaccade) {
      const reach = 0.05 + 0.07 * Math.min(this.restlessness, 2);
      this.ox = between(this.rng, -reach, reach);
      this.oy = between(this.rng, -reach, reach) * 0.7;
      this.snapUntil = now + 0.06;
      this.nextSaccade = now + between(this.rng, 0.8, 2.6) / Math.max(0.25, this.restlessness);
    }
    // Smooth pursuit normally; a saccade is a quick, stiff jump.
    const omega = now < this.snapUntil ? 70 : 9;
    let gx = tx + this.ox;
    let gy = ty + this.oy;
    const len = Math.hypot(gx, gy);
    if (len > GAZE_LIMIT) {
      gx *= GAZE_LIMIT / len;
      gy *= GAZE_LIMIT / len;
    }
    [this.x, this.vx] = springStep(this.x, this.vx, gx, omega, 1, dt);
    [this.y, this.vy] = springStep(this.y, this.vy, gy, omega, 1, dt);
  }
}

/**
 * Gaze target for a point `dx, dy` pixels from the body on screen, `radius`
 * the body's radius in pixels: the eye turns toward it, more the farther away.
 */
export function gazeToward(dx: number, dy: number, radius: number): [number, number] {
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return [0, 0];
  // Within the body it barely turns; a few body widths away it's in profile.
  const k = GAZE_LIMIT * clamp((d - radius * 0.3) / (radius * 5), 0, 1) ** 0.6;
  return [(dx / d) * k, (dy / d) * k];
}

/** Pupil size, 0 narrow to 1 wide: widens on interest, narrows slowly back. */
export class Pupil {
  private excitement = 0;
  /** Held while something keeps it interested, such as the cursor on it. */
  hold = 0;

  interest(amount: number): void {
    this.excitement = Math.max(this.excitement, amount);
  }

  update(dt: number): number {
    this.excitement *= Math.exp(-dt / 1.6);
    return clamp(0.3 + 0.7 * Math.max(this.excitement, this.hold), 0, 1);
  }
}

/** Occasional highlight sweeping across the cornea. */
export class Glimmer {
  private start = -Infinity;
  private next: number;

  constructor(
    private readonly rng: Rng,
    now = 0,
  ) {
    this.next = now + between(rng, 6, 14);
  }

  /** Sweeps now (success). */
  flash(now: number): void {
    this.start = now;
  }

  /** Progress of the sweep, 0 to 1, or -1 when none is showing. */
  at(now: number): number {
    if (now >= this.next) {
      this.start = this.next;
      this.next += between(this.rng, 6, 14);
    }
    const t = (now - this.start) / 0.7;
    return t >= 0 && t <= 1 ? t : -1;
  }
}

/** A lobe of the body: center and radius, in units of the body's radius. */
export interface Lobe {
  x: number;
  y: number;
  z: number;
  r: number;
}

/** The farthest the body reaches from its center, in body radii (moving or squished aside). */
export const BODY_EXTENT = 1.12;

/** Number of lobes around the core. */
export const LOBES = 4;
/** Seconds per breath. */
export const BREATH_S = 4;

export interface BodyMotion {
  /** Velocity in view space, body radii per second. */
  vx: number;
  vy: number;
  vz: number;
  /** Squish from a click: positive squashes, negative stretches. */
  squish: number;
  /** False when reduced motion freezes the throb and the lag. */
  animate: boolean;
}

/**
 * The body's metaballs at time `t`: a breathing core, lobes orbiting it on
 * their own phases, and when it moves, lobes lagging behind and a droplet
 * trailing that rejoins as it settles. All within BODY_EXTENT.
 */
export function bodyLobes(t: number, m: BodyMotion): Lobe[] {
  const time = m.animate ? t : 0;
  const breath = Math.sin((2 * Math.PI * time) / BREATH_S);
  const out: Lobe[] = [{ x: 0, y: 0, z: 0, r: 0.56 * (1 + 0.05 * breath) }];
  for (let i = 0; i < LOBES; i++) {
    const a = time * (0.23 + 0.07 * i) + i * 1.9;
    const b = time * (0.17 + 0.05 * i) + i * 2.7;
    const swell = 1 + 0.12 * Math.sin(time * (0.5 + 0.13 * i) + i);
    out.push({
      x: Math.cos(a) * 0.46,
      y: Math.sin(b) * 0.4,
      z: Math.sin(a + b) * 0.22 - 0.1,
      r: (0.32 + 0.05 * (i % 2)) * swell * (1 + 0.03 * breath),
    });
  }
  const speed = Math.hypot(m.vx, m.vy, m.vz);
  if (m.animate && speed > 1e-3) {
    // Lobes lag along the path, each by its own amount; a droplet trails.
    const lag = Math.min(speed, 6) / speed;
    for (let i = 1; i < out.length; i++) {
      const k = 0.02 + 0.025 * i;
      out[i]!.x -= m.vx * lag * k;
      out[i]!.y -= m.vy * lag * k;
      out[i]!.z -= m.vz * lag * k;
    }
    const s = clamp(speed / 6, 0, 1);
    out.push({ x: -m.vx * lag * 0.16, y: -m.vy * lag * 0.16, z: -m.vz * lag * 0.16, r: 0.2 * s });
  } else {
    out.push({ x: 0, y: 0, z: 0, r: 0 });
  }
  if (m.animate && m.squish !== 0) {
    // Squash: flatter and wider, volume roughly kept.
    const sy = 1 - m.squish;
    const sx = 1 / Math.sqrt(Math.max(0.2, sy));
    for (const l of out) {
      l.x *= sx;
      l.y *= sy;
      l.z *= sx;
    }
    out[0]!.r *= 1 + Math.abs(m.squish) * 0.1;
  }
  return out;
}

/** What the eye attends to; the controller turns each into a screen point. */
export type Focus =
  { kind: 'user' } | { kind: 'pointer' } | { kind: 'portal' } | { kind: 'knob'; slot: number };

export type View = 'neutral' | 'left' | 'right' | 'lean';

export interface AttentionInput {
  view: View;
  /** The cursor is on the companion. */
  hovered: boolean;
  /** The cursor is over the cockpit (not off the window). */
  pointerOn: boolean;
  /** Dragging in the portal (iMouse). */
  dragging: boolean;
}

/**
 * Chooses what the eye looks at in each view, with brief glances at whatever
 * just changed (a knob turned, a shader compiled) and back.
 */
export class Attention {
  private glance: { focus: Focus; until: number } | null = null;
  private nextGlance: number;
  private lastKnob = -1;

  constructor(
    private readonly rng: Rng,
    now = 0,
  ) {
    this.nextGlance = now + between(rng, 7, 15);
  }

  /** A knob is being turned: glance at it while it moves, and a moment after. */
  knobTurned(now: number, slot: number): void {
    this.lastKnob = slot;
    this.glance = { focus: { kind: 'knob', slot }, until: now + 1.2 };
  }

  /** A new shader compiled: look at the portal. */
  compiled(now: number): void {
    this.glance = { focus: { kind: 'portal' }, until: now + 1 };
  }

  focus(now: number, input: AttentionInput): Focus {
    if (input.hovered) return { kind: 'pointer' };
    if (input.view === 'lean' && input.dragging) return { kind: 'pointer' };
    if (this.glance && now < this.glance.until) return this.glance.focus;
    this.glance = null;
    if (now >= this.nextGlance) {
      this.nextGlance = now + between(this.rng, 7, 15);
      this.glance = {
        focus: this.idleGlance(input.view),
        until: now + between(this.rng, 0.7, 1.1),
      };
      return this.glance.focus;
    }
    switch (input.view) {
      case 'neutral':
        return { kind: 'user' };
      case 'left':
      case 'right':
        return input.pointerOn ? { kind: 'pointer' } : { kind: 'user' };
      case 'lean':
        return { kind: 'portal' };
    }
  }

  /** Sitting back it glances at the portal or a knob; leaned in, at the knobs. */
  private idleGlance(view: View): Focus {
    const knob = (): Focus => ({
      kind: 'knob',
      slot:
        this.lastKnob >= 0 && this.rng() < 0.6
          ? this.lastKnob
          : Math.floor(this.rng() * KNOB_SLOTS),
    });
    if (view === 'lean') return knob();
    if (view === 'neutral') return this.rng() < 0.5 ? { kind: 'portal' } : knob();
    return { kind: 'user' };
  }
}
