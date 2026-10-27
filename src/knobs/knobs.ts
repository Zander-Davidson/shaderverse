// Knob slots in the top row of the hanging console. Each slot is a canvas
// face (dish, ring and a label strip beneath) with a 3D cap in front of it,
// both in the console's own frame. Values go to the store, and from there to
// uniforms only: turning a knob never recompiles.

import * as THREE from 'three';
import { chromeMaterial } from '../style/console';
import { physicalMaterial } from '../style/quality';
import { CanvasPanel, redrawListenerRef, type PanelPointerEvent, type PointerTarget } from '../panels/panel';
import { KNOB_FACE, KNOB_LIFT, KNOB_STRIP, knobLocal } from '../console/plan';

const redrawListener = { call: (o: THREE.Object3D) => redrawListenerRef()?.(o) };
import { KNOB_SLOTS, type KnobRecord } from '../project/schema';
import type { ProjectStore } from '../project/store';
import { COLORS, KNOB_TINT, MONO } from '../theme';

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

/** Radius of a knob's recessed dish, as a fraction of the face's width. */
const DISH = (192 - 14) / 384;
/** Face texture width; its height adds the label strip. */
const FACE_PX = 384;

class KnobFace extends CanvasPanel {
  knob: KnobRecord | null = null;
  hover = false;
  active = false;
  /** Lit because its parameter is hovered in the code. */
  linked = false;

  constructor(readonly slot: number) {
    super({ x: 0, y: 0, w: KNOB_FACE, h: KNOB_FACE + KNOB_STRIP }, FACE_PX, Math.round((FACE_PX * (KNOB_FACE + KNOB_STRIP)) / KNOB_FACE), 0, 0);
    const [x, y] = knobLocal(slot);
    // The dish centered on the slot, the strip hanging below it.
    this.mesh.position.set(x, y - KNOB_STRIP / 2, 0.004);
  }

  protected override geometryFor(): THREE.BufferGeometry {
    return new THREE.PlaneGeometry(this.rect.w, this.rect.h);
  }

  protected draw(ctx: CanvasRenderingContext2D): void {
    const W = this.pixelWidth;
    const H = this.pixelHeight;
    const cx = W / 2;
    const cy = W / 2;
    // Ring just outside the cap.
    const R = W * 0.3;
    const tint = KNOB_TINT;
    const k = this.knob;
    ctx.clearRect(0, 0, W, H);

    // Mounting well: a dark dish recessed in the console's knob collar, out
    // to where the collar rises from its floor.
    const rd = W * DISH;
    const dish = ctx.createRadialGradient(cx, cy - W * 0.08, W * 0.05, cx, cy, rd);
    dish.addColorStop(0, k ? '#0f1c1c' : '#0a1111');
    dish.addColorStop(0.85, '#050a0a');
    dish.addColorStop(1, '#020404');
    ctx.beginPath();
    ctx.arc(cx, cy, rd, 0, Math.PI * 2);
    ctx.fillStyle = dish;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, rd - 6, 0, Math.PI * 2);
    if (k && (this.hover || this.active || this.linked)) {
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

    // The label strip: a dark engraved plate under the dish.
    const sy = W + 4;
    const sh = H - W - 12;
    ctx.beginPath();
    ctx.roundRect(10, sy, W - 20, sh, 14);
    ctx.fillStyle = '#060a0b';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = k && (this.hover || this.active || this.linked) ? `${tint}aa` : '#1d2a30';
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (!k) {
      // An empty slot: bare chrome over the well, a blank strip.
      ctx.fillStyle = '#26343b';
      ctx.font = `600 30px ${MONO}`;
      ctx.fillText(`— ${this.slot + 1} —`, cx, sy + sh / 2);
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

    // Label above the value, each shrunk to fit the strip.
    const fit = (text: string, weight: number, sizes: number[]) => {
      for (const px of sizes) {
        ctx.font = `${weight} ${px}px ${MONO}`;
        if (ctx.measureText(text).width <= W - 44) return text;
      }
      let t = text;
      while (t.length > 1 && ctx.measureText(t).width > W - 44) t = `${t.slice(0, -2)}…`;
      return t;
    };
    ctx.fillStyle = this.linked ? '#ffffff' : tint;
    ctx.fillText(fit(k.label.toUpperCase(), 700, [58, 50, 43, 37, 32]), cx, sy + sh * 0.3);
    ctx.fillStyle = this.active ? '#ffffff' : COLORS.text;
    ctx.fillText(fit(formatValue(k, k.value), 600, [54, 46, 40]), cx, sy + sh * 0.73);
  }
}

class KnobCap {
  readonly group = new THREE.Group();
  readonly pivot = new THREE.Group();
  readonly indicatorMat: THREE.MeshBasicMaterial;
  private readonly body: THREE.Mesh;

  constructor(tint: string) {
    // The same chrome as the console it's mounted in.
    const chrome = chromeMaterial();
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

  /** On the console's face, facing out of it (local +z). */
  place(slot: number) {
    const [x, y] = knobLocal(slot);
    this.group.position.set(x, y, KNOB_LIFT);
    // Cap geometry is modeled for a 0.98-wide face.
    this.group.scale.setScalar(KNOB_FACE / 0.98);
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

  /** Called when the pointer comes onto or leaves an assigned knob. */
  onHover: ((knob: KnobRecord | null) => void) | null = null;

  constructor(
    readonly slot: number,
    private readonly store: ProjectStore,
  ) {
    this.face = new KnobFace(slot);
    this.cap = new KnobCap(KNOB_TINT);
    this.cap.place(slot);
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
    return this.cap.group.getWorldPosition(new THREE.Vector3());
  }

  /** Lights the slot because its parameter is hovered in the code. */
  setLinked(on: boolean) {
    if (on === this.face.linked) return;
    this.face.linked = on;
    this.face.invalidate();
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
        this.onHover?.(h ? k : null);
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
  /** The faces and caps, in the console's frame. */
  readonly group = new THREE.Group();
  /** Called when the pointer comes onto or leaves an assigned knob. */
  onHover: ((knob: KnobRecord | null) => void) | null = null;

  constructor(store: ProjectStore) {
    for (let i = 0; i < KNOB_SLOTS; i++) {
      const s = new KnobSlot(i, store);
      s.onHover = (k) => this.onHover?.(k);
      this.slots.push(s);
      this.group.add(s.face.mesh, s.cap.group);
    }
    const sync = () => {
      const knobs = store.getState().project.knobs;
      for (const s of this.slots) {
        const k = knobs.find((x) => x.slot === s.slot) ?? null;
        s.setKnob(k);
      }
    };
    sync();
    store.subscribe((st, prev) => {
      if (st.project.knobs !== prev.project.knobs) sync();
    });
  }

  /** Lights the slot whose knob drives `param`, and no other. */
  highlight(param: string | null) {
    for (const s of this.slots) s.setLinked(!!param && s.knob?.param === param);
  }

  update() {
    for (const s of this.slots) s.face.update();
  }

  setAnisotropy(n: number) {
    for (const s of this.slots) s.face.setAnisotropy(n);
  }
}

