// Knob slots around the portal. Each slot is a canvas face (ring, label,
// value) with a 3D cap in front of it. Values go to the store, and from there
// to uniforms only: turning a knob never recompiles.

import * as THREE from 'three';
import { knobSlotPosition, type LayoutConfig, type Rect } from '../cockpit/layout';
import { CanvasPanel, type PanelPointerEvent, type PointerTarget } from '../panels/panel';
import { wallToWorld } from '../panels/patch';
import { KNOB_SLOTS, type KnobRecord } from '../project/schema';
import type { ProjectStore } from '../project/store';
import { COLORS, KNOB_TINTS, MONO } from '../theme';

/** Screen pixels of vertical drag for the full range; fine control divides by 10. */
export const DRAG_PX_FULL_RANGE = 240;
const FACE_ASPECT = 1.2;
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
  const h = w * FACE_ASPECT;
  // The ring's center sits at the slot position; the label hangs below it.
  return { x: p.x, y: p.y - (h - w) / 2, w, h };
}

class KnobFace extends CanvasPanel {
  knob: KnobRecord | null = null;
  hover = false;
  active = false;

  constructor(cfg: LayoutConfig, readonly slot: number) {
    super(faceRect(cfg, slot), 384, Math.round(384 * FACE_ASPECT), cfg.radius, 0.015);
  }

  protected draw(ctx: CanvasRenderingContext2D): void {
    const W = this.pixelWidth;
    const H = this.pixelHeight;
    const cx = W / 2;
    const cy = W / 2;
    const R = W * 0.4;
    const tint = KNOB_TINTS[this.slot % KNOB_TINTS.length]!;
    const k = this.knob;
    ctx.clearRect(0, 0, W, H);

    // Mounting plate
    ctx.beginPath();
    ctx.arc(cx, cy, R + 26, 0, Math.PI * 2);
    ctx.fillStyle = k ? (this.hover || this.active ? '#111b23' : '#0b1218') : '#080d11';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = k && (this.hover || this.active) ? `${tint}aa` : '#17222b';
    ctx.stroke();

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
      ctx.font = `600 22px ${MONO}`;
      ctx.fillStyle = '#26333d';
      ctx.fillText(`SLOT ${this.slot + 1}`, cx, W + 12);
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

    const label = k.label.length > 14 ? `${k.label.slice(0, 13)}…` : k.label;
    ctx.font = `600 30px ${MONO}`;
    ctx.fillStyle = tint;
    ctx.fillText(label, cx, W + 2);
    ctx.font = `500 30px ${MONO}`;
    ctx.fillStyle = this.active ? '#ffffff' : COLORS.text;
    ctx.fillText(formatValue(k, k.value), cx, W + 40);
  }
}

class KnobCap {
  readonly group = new THREE.Group();
  readonly pivot = new THREE.Group();
  readonly indicatorMat: THREE.MeshBasicMaterial;
  private readonly body: THREE.Mesh;

  constructor(tint: string) {
    const bodyMat = new THREE.MeshStandardMaterial({ color: '#1a232b', metalness: 0.7, roughness: 0.32 });
    const body = new THREE.CylinderGeometry(0.235, 0.265, 0.16, 64, 1);
    body.rotateX(Math.PI / 2);
    this.body = new THREE.Mesh(body, bodyMat);
    this.group.add(this.body);
    // Knurled skirt
    const skirt = new THREE.Mesh(
      new THREE.TorusGeometry(0.255, 0.012, 8, 64),
      new THREE.MeshStandardMaterial({ color: '#2a3743', metalness: 0.8, roughness: 0.4 }),
    );
    skirt.position.z = 0.02;
    this.group.add(skirt);
    this.indicatorMat = new THREE.MeshBasicMaterial({ color: tint, toneMapped: false });
    const ind = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.012), this.indicatorMat);
    ind.position.set(0, 0.155, 0.082);
    this.pivot.add(ind);
    this.group.add(this.pivot);
  }

  place(cfg: LayoutConfig, slot: number) {
    const p = knobSlotPosition(cfg, slot, KNOB_SLOTS);
    wallToWorld(p.x, p.y, cfg.radius, 0.09, this.group.position);
    this.group.lookAt(0, 0, 0);
  }

  setVisible(v: boolean) {
    this.group.visible = v;
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
    this.cap = new KnobCap(KNOB_TINTS[slot % KNOB_TINTS.length]!);
    this.cap.place(cfg, slot);
    this.cap.setVisible(false);
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
    this.cap.setVisible(!!k);
    if (k) {
      const f = k.max > k.min ? (k.value - k.min) / (k.max - k.min) : 0;
      this.cap.pivot.rotation.z = (0.75 - 1.5 * Math.min(1, Math.max(0, f))) * Math.PI;
    }
    if (prev !== k) this.face.invalidate();
  }

  private setActive(active: boolean) {
    this.face.active = active;
    this.cap.indicatorMat.color.set(active ? '#ffffff' : KNOB_TINTS[this.slot % KNOB_TINTS.length]!);
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

  constructor(cfg: LayoutConfig, store: ProjectStore) {
    for (let i = 0; i < KNOB_SLOTS; i++) {
      const s = new KnobSlot(cfg, i, store);
      this.slots.push(s);
      this.group.add(s.face.mesh, s.cap.group);
    }
    const sync = () => {
      const knobs = store.getState().project.knobs;
      for (const s of this.slots) s.setKnob(knobs.find((k) => k.slot === s.slot) ?? null);
    };
    sync();
    store.subscribe((st, prev) => {
      if (st.project.knobs !== prev.project.knobs) sync();
    });
  }

  relayout(cfg: LayoutConfig) {
    for (const s of this.slots) s.relayout(cfg);
  }

  update() {
    for (const s of this.slots) s.face.update();
  }

  setAnisotropy(n: number) {
    for (const s of this.slots) s.face.setAnisotropy(n);
  }
}

