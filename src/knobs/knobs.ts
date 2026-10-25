// Knob slots around the portal. Each slot is a canvas face (ring, label,
// value) with a 3D cap in front of it. Values go to the store, and from there
// to uniforms only: turning a knob never recompiles.

import * as THREE from 'three';
import { gunmetalMaterial } from '../style/chassis';
import { physicalMaterial } from '../style/quality';
import { knobSlotPosition, type LayoutConfig, type Rect } from '../cockpit/layout';
import { CanvasPanel, redrawListenerRef, type PanelPointerEvent, type PointerTarget } from '../panels/panel';

const redrawListener = { call: (o: THREE.Object3D) => redrawListenerRef()?.(o) };
import { wallToWorld } from '../panels/patch';
import { KNOB_SLOTS, type KnobRecord } from '../project/schema';
import type { ProjectStore } from '../project/store';
import { COLORS, KNOB_TINT, MONO } from '../theme';
import { KnobTubes } from './tubes';

/** Screen pixels of vertical drag for the full range; fine control divides by 10. */
export const DRAG_PX_FULL_RANGE = 240;
const ARC_START = Math.PI * 0.75;
const ARC_SWEEP = Math.PI * 1.5;

export function quantize(k: Pick<KnobRecord, 'min' | 'max' | 'step' | 'type'>, v: number): number {
  let out = Math.min(k.max, Math.max(k.min, v));
  const step = k.type === 'int' ? Math.max(1, k.step) : k.step;
  if (step > 0) out = k.min + Math.round((out - k.min) / step) * step;
  return Math.min(k.max, Math.max(k.min, Number(out.toPrecision(10))));
}

export function formatValue(k: Pick<KnobRecord, 'type'>, v: number): string {
  if (k.type === 'int') return String(Math.round(v));
  const a = Math.abs(v);
  return a >= 100 ? v.toFixed(1) : a >= 10 ? v.toFixed(2) : v.toFixed(3);
}

function faceRect(cfg: LayoutConfig, slot: number): Rect {
  const p = knobSlotPosition(cfg, slot, KNOB_SLOTS);
  const w = cfg.knobRing.size;
  return { x: p.x, y: p.y, w, h: w };
}

/**
 * Draws `text` along a circle of radius `r` around (cx, cy), centered on the
 * top or bottom of the circle and always reading left to right, upright.
 */
export function arcText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  r: number,
  side: 'top' | 'bottom',
  maxSweep: number,
  font: (px: number) => string,
  sizes: number[],
): void {
  // Pick the largest size that fits the sweep, then truncate if still too long.
  let shown = text;
  let px = sizes[sizes.length - 1]!;
  for (const s of sizes) {
    ctx.font = font(s);
    if (ctx.measureText(text).width / r <= maxSweep) {
      px = s;
      break;
    }
  }
  ctx.font = font(px);
  while (shown.length > 1 && ctx.measureText(shown).width / r > maxSweep) shown = `${shown.slice(0, -2)}…`;

  const widths = [...shown].map((ch) => ctx.measureText(ch).width);
  const sweep = widths.reduce((a, b) => a + b, 0) / r;
  const dir = side === 'top' ? 1 : -1;
  // Top text runs clockwise from the left; bottom text runs counterclockwise.
  let a = (side === 'top' ? -Math.PI / 2 : Math.PI / 2) - (dir * sweep) / 2;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  [...shown].forEach((ch, i) => {
    const half = widths[i]! / 2 / r;
    a += dir * half;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.rotate(side === 'top' ? a + Math.PI / 2 : a - Math.PI / 2);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    a += dir * half;
  });
  ctx.restore();
}

class KnobFace extends CanvasPanel {
  knob: KnobRecord | null = null;
  hover = false;
  active = false;

  constructor(cfg: LayoutConfig, readonly slot: number) {
    // In front of the portal rim, so labels are never covered.
    super(faceRect(cfg, slot), 384, 384, cfg.radius, 0.025);
  }

  protected draw(ctx: CanvasRenderingContext2D): void {
    const W = this.pixelWidth;
    const H = this.pixelHeight;
    const cx = W / 2;
    const cy = H / 2;
    // Ring just outside the cap; labels wrap around outside the ticks.
    const R = W * 0.3;
    const TEXT_R = W * 0.415;
    const tint = KNOB_TINT;
    const k = this.knob;
    ctx.clearRect(0, 0, W, H);

    // Mounting well: a dark recessed dish with a lit metal lip.
    const lip = ctx.createLinearGradient(0, 0, W, H);
    lip.addColorStop(0, '#9fb6bb');
    lip.addColorStop(0.35, '#2f4146');
    lip.addColorStop(0.7, '#0e1517');
    lip.addColorStop(1, '#4a6066');
    ctx.beginPath();
    ctx.arc(cx, cy, W / 2 - 3, 0, Math.PI * 2);
    ctx.fillStyle = lip;
    ctx.fill();
    const dish = ctx.createRadialGradient(cx, cy - W * 0.08, W * 0.05, cx, cy, W / 2 - 14);
    dish.addColorStop(0, k ? '#0f1c1c' : '#0a1111');
    dish.addColorStop(0.85, '#050a0a');
    dish.addColorStop(1, '#020404');
    ctx.beginPath();
    ctx.arc(cx, cy, W / 2 - 14, 0, Math.PI * 2);
    ctx.fillStyle = dish;
    ctx.fill();
    if (k && (this.hover || this.active)) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = `${tint}aa`;
      ctx.stroke();
    }

    // Track
    ctx.lineCap = 'round';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.arc(cx, cy, R, ARC_START, ARC_START + ARC_SWEEP);
    ctx.strokeStyle = '#1b2731';
    ctx.stroke();
    for (let i = 0; i <= 10; i++) {
      const a = ARC_START + (ARC_SWEEP * i) / 10;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (R + 12), cy + Math.sin(a) * (R + 12));
      ctx.lineTo(cx + Math.cos(a) * (R + (i % 5 === 0 ? 24 : 18)), cy + Math.sin(a) * (R + (i % 5 === 0 ? 24 : 18)));
      ctx.lineWidth = 3;
      ctx.strokeStyle = k ? '#3a4b58' : '#1a252e';
      ctx.stroke();
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (!k) {
      // An empty slot: bare chrome over the well, no readouts.
      return;
    }

    const f = k.max > k.min ? (k.value - k.min) / (k.max - k.min) : 0;
    // Value arc, from zero when the range spans it, otherwise from the minimum.
    const zf = k.min < 0 && k.max > 0 ? -k.min / (k.max - k.min) : 0;
    const a0 = ARC_START + ARC_SWEEP * Math.min(zf, f);
    const a1 = ARC_START + ARC_SWEEP * Math.max(zf, f);
    ctx.lineWidth = 12;
    ctx.strokeStyle = tint;
    ctx.shadowColor = tint;
    ctx.shadowBlur = this.active ? 24 : 12;
    ctx.beginPath();
    ctx.arc(cx, cy, R, a0, Math.max(a1, a0 + 0.001));
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = tint;
    arcText(ctx, k.label.toUpperCase(), cx, cy, TEXT_R, 'top', Math.PI * 0.85, (px) => `700 ${px}px ${MONO}`, [30, 26, 22, 19]);
    ctx.fillStyle = this.active ? '#ffffff' : COLORS.text;
    // The value sits in the gap at the bottom of the ring.
    arcText(ctx, formatValue(k, k.value), cx, cy, TEXT_R, 'bottom', Math.PI * 0.45, (px) => `600 ${px}px ${MONO}`, [30, 26, 22]);
  }
}

class KnobCap {
  readonly group = new THREE.Group();
  readonly pivot = new THREE.Group();
  readonly indicatorMat: THREE.MeshBasicMaterial;
  private readonly body: THREE.Mesh;

  constructor(tint: string) {
    // Polished chrome with a faint thin-film sheen.
    const chrome = gunmetalMaterial();
    const dark = physicalMaterial({ color: '#1b2427', metalness: 0.9, roughness: 0.38, clearcoat: 0.5 });
    // A lathed profile: wide skirt, waist, domed cap.
    const profile = [
      [0.0, 0.0], [0.28, 0.0], [0.285, 0.035], [0.27, 0.06], [0.235, 0.075], [0.225, 0.12],
      [0.215, 0.15], [0.19, 0.168], [0.12, 0.178], [0.0, 0.182],
    ].map(([r, h]) => new THREE.Vector2(r, h));
    const lathe = new THREE.LatheGeometry(profile, 72);
    // Lathe axis is +y; turn it to face the camera along +z.
    lathe.rotateX(Math.PI / 2);
    this.body = new THREE.Mesh(lathe, chrome);
    this.group.add(this.body);
    // Knurled grip: a ring of fine ridges around the skirt.
    const ridges = new THREE.InstancedMesh(new THREE.BoxGeometry(0.012, 0.02, 0.05), dark, 48);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      m.makeRotationZ(a).setPosition(Math.cos(a) * 0.278, Math.sin(a) * 0.278, 0.03);
      ridges.setMatrixAt(i, m);
    }
    this.group.add(ridges);
    // Recessed dark face on the cap.
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.15, 48), dark);
    face.position.z = 0.183;
    this.group.add(face);
    this.indicatorMat = new THREE.MeshBasicMaterial({ color: tint, toneMapped: false });
    const ind = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.11, 0.012), this.indicatorMat);
    ind.position.set(0, 0.09, 0.19);
    this.pivot.add(ind);
    this.group.add(this.pivot);
  }

  place(cfg: LayoutConfig, slot: number) {
    const p = knobSlotPosition(cfg, slot, KNOB_SLOTS);
    wallToWorld(p.x, p.y, cfg.radius, 0.09, this.group.position);
    this.group.lookAt(0, 0, 0);
    // Cap geometry is modeled for a 0.98-wide face.
    this.group.scale.setScalar(cfg.knobRing.size / 0.98);
  }

  /** Empty slots keep the chrome cap but lose the angle notch. */
  setAssigned(v: boolean) {
    this.pivot.visible = v;
  }
}

export class KnobSlot implements PointerTarget {
  readonly face: KnobFace;
  readonly cap: KnobCap;
  private drag: { lastY: number; moved: number } | null = null;
  private rawValue: number | null = null;
  private clickTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    cfg: LayoutConfig,
    readonly slot: number,
    private readonly store: ProjectStore,
  ) {
    this.face = new KnobFace(cfg, slot);
    this.cap = new KnobCap(KNOB_TINT);
    this.cap.place(cfg, slot);
    this.cap.setAssigned(false);
  }

  get meshes() {
    return [this.face.mesh, this.cap.group];
  }

  get pixelWidth() {
    return this.face.pixelWidth;
  }

  get pixelHeight() {
    return this.face.pixelHeight;
  }

  get knob() {
    return this.face.knob;
  }

  /** World anchor for the popover. */
  anchor(): THREE.Vector3 {
    return this.cap.group.position;
  }

  relayout(cfg: LayoutConfig) {
    this.face.rebuild(cfg.radius, faceRect(cfg, this.slot));
    this.cap.place(cfg, this.slot);
  }

  setKnob(k: KnobRecord | null) {
    const prev = this.face.knob;
    this.face.knob = k;
    if (this.cap.pivot.visible !== !!k) redrawListener.call(this.cap.group);
    this.cap.setAssigned(!!k);
    if (k) {
      const f = k.max > k.min ? (k.value - k.min) / (k.max - k.min) : 0;
      const rz = (0.75 - 1.5 * Math.min(1, Math.max(0, f))) * Math.PI;
      if (rz !== this.cap.pivot.rotation.z) {
        this.cap.pivot.rotation.z = rz;
        redrawListener.call(this.cap.group);
      }
    }
    if (prev !== k) this.face.invalidate();
  }

  private setActive(active: boolean) {
    this.face.active = active;
    this.cap.indicatorMat.color.set(active ? '#ffffff' : KNOB_TINT);
    redrawListener.call(this.cap.group);
    this.face.invalidate();
  }

  onPointer(e: PanelPointerEvent): boolean | void {
    const k = this.knob;
    if (e.kind === 'hover' || e.kind === 'leave') {
      const h = e.kind === 'hover';
      if (h !== this.face.hover) {
        this.face.hover = h;
        this.face.invalidate();
      }
      return;
    }
    if (!k) return;
    const dispatch = this.store.getState().dispatch;

    if (e.kind === 'down' && e.button === 0) {
      this.drag = { lastY: e.clientY, moved: 0 };
      this.setActive(true);
      return true;
    }
    if (e.kind === 'move' && this.drag) {
      const dy = this.drag.lastY - e.clientY;
      this.drag.lastY = e.clientY;
      this.drag.moved += Math.abs(dy);
      if (this.drag.moved < 3) return;
      const fine = e.shiftKey || e.altKey;
      const delta = (dy / DRAG_PX_FULL_RANGE) * (k.max - k.min) * (fine ? 0.1 : 1);
      // Accumulate unquantized so small steps still add up.
      const raw = (this.rawValue ?? k.value) + delta;
      this.rawValue = Math.min(k.max, Math.max(k.min, raw));
      const v = quantize(k, this.rawValue);
      if (v !== k.value) dispatch({ type: 'setKnobValue', id: k.id, value: v });
      return;
    }
    if (e.kind === 'up' && this.drag) {
      const click = this.drag.moved < 3;
      this.drag = null;
      this.rawValue = null;
      this.setActive(false);
      if (click) {
        clearTimeout(this.clickTimer);
        this.clickTimer = setTimeout(() => dispatch({ type: 'openPopover', id: k.id }), 280);
      }
      return;
    }
    if (e.kind === 'dblclick') {
      clearTimeout(this.clickTimer);
      dispatch({ type: 'resetKnob', id: k.id });
      return;
    }
    if (e.kind === 'contextmenu') {
      clearTimeout(this.clickTimer);
      dispatch({ type: 'openPopover', id: k.id });
    }
  }

  cursorAt(): string {
    return this.knob ? 'ns-resize' : 'default';
  }
}

export class KnobBank {
  readonly slots: KnobSlot[] = [];
  readonly group = new THREE.Group();
  readonly tubes: KnobTubes;

  constructor(cfg: LayoutConfig, store: ProjectStore) {
    this.tubes = new KnobTubes(cfg);
    for (let i = 0; i < KNOB_SLOTS; i++) {
      const s = new KnobSlot(cfg, i, store);
      this.slots.push(s);
      this.group.add(s.face.mesh, s.cap.group);
    }
    const sync = () => {
      const knobs = store.getState().project.knobs;
      for (const s of this.slots) {
        const k = knobs.find((x) => x.slot === s.slot) ?? null;
        const was = !!s.knob;
        s.setKnob(k);
        if (was !== !!k) {
          this.tubes.setActive(s.slot, !!k, KNOB_TINT);
          const g = this.tubes.tubeGroup(s.slot);
          if (g) redrawListener.call(g);
        }
      }
    };
    for (let i = 0; i < KNOB_SLOTS; i++) this.tubes.setActive(i, false, KNOB_TINT);
    sync();
    store.subscribe((st, prev) => {
      if (st.project.knobs !== prev.project.knobs) sync();
    });
  }

  relayout(cfg: LayoutConfig) {
    for (const s of this.slots) s.relayout(cfg);
    this.tubes.relayout(cfg);
    for (const s of this.slots) this.tubes.setActive(s.slot, !!s.knob, KNOB_TINT);
  }

  update(time = 0) {
    for (const s of this.slots) s.face.update();
    this.tubes.update(time);
  }

  setAnisotropy(n: number) {
    for (const s of this.slots) s.face.setAnisotropy(n);
  }
}

