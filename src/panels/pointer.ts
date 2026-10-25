// Pointer adapter: raycasts canvas pointer events against panel meshes and
// delivers them in each panel's own pixel coordinates.

import * as THREE from 'three';
import type { PanelPointerEvent, PanelPointerKind, PointerTarget } from './panel';
import { uvToPixel } from './patch';

const LEAVE: PanelPointerEvent = {
  kind: 'leave', x: NaN, y: NaN, u: NaN, v: NaN, clientX: NaN, clientY: NaN, button: -1, buttons: 0,
  shiftKey: false, altKey: false, metaKey: false, ctrlKey: false, deltaY: 0, captured: false,
};

interface Hit {
  target: PointerTarget;
  u: number;
  v: number;
}

export class PointerRouter {
  enabled = true;
  private targets: PointerTarget[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private captured: PointerTarget | null = null;
  private hovered: PointerTarget | null = null;
  private lastHit: Hit | null = null;
  /** Called on every canvas pointer down with the hit target; overlays close on it. */
  onCanvasDown: ((target: PointerTarget | null) => void) | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: THREE.Camera,
  ) {
    // The portal renders on its own layer; picking still sees it.
    this.raycaster.layers.enableAll();
    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    canvas.addEventListener('pointerup', (e) => this.onUp(e));
    canvas.addEventListener('pointercancel', (e) => this.onUp(e));
    canvas.addEventListener('pointerleave', () => this.setHover(null));
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    canvas.addEventListener('dblclick', (e) => this.route('dblclick', e, this.pick(e)));
    canvas.addEventListener('contextmenu', (e) => {
      const hit = this.pick(e);
      if (hit) {
        e.preventDefault();
        this.route('contextmenu', e, hit);
      }
    });
  }

  add(target: PointerTarget): void {
    this.targets.push(target);
  }

  /** Raycasts a client point; exposed for tests and overlays. */
  pickClient(clientX: number, clientY: number): Hit | null {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const meshes = this.targets.flatMap((t) => t.meshes);
    const hits = this.raycaster.intersectObjects(meshes, true);
    for (const h of hits) {
      const target = this.targets.find((t) => t.meshes.some((m) => isWithin(h.object, m)));
      if (!target || !h.uv) continue;
      if (target.hitTest) {
        const px = uvToPixel(h.uv.x, h.uv.y, target.pixelWidth, target.pixelHeight);
        if (!target.hitTest(px.x, px.y)) continue;
      }
      return { target, u: h.uv.x, v: h.uv.y };
    }
    return null;
  }

  private pick(e: MouseEvent): Hit | null {
    return this.pickClient(e.clientX, e.clientY);
  }

  /** For a captured drag off the panel, project onto the panel's last known uv. */
  private route(kind: PanelPointerKind, e: MouseEvent | WheelEvent, hit: Hit | null, to?: PointerTarget) {
    const target = to ?? hit?.target;
    if (!target) return false;
    const onTarget = hit && hit.target === target ? hit : null;
    const u = onTarget?.u ?? this.lastHit?.u ?? NaN;
    const v = onTarget?.v ?? this.lastHit?.v ?? NaN;
    const px = uvToPixel(u, v, target.pixelWidth, target.pixelHeight);
    const ev: PanelPointerEvent = {
      kind,
      x: px.x,
      y: px.y,
      u,
      v,
      clientX: e.clientX,
      clientY: e.clientY,
      button: e.button,
      buttons: e.buttons,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      metaKey: e.metaKey,
      ctrlKey: e.ctrlKey,
      deltaY: 'deltaY' in e ? e.deltaY : 0,
      captured: this.captured === target,
    };
    return target.onPointer(ev);
  }

  private setHover(target: PointerTarget | null) {
    if (this.hovered && this.hovered !== target) this.hovered.onPointer(LEAVE);
    this.hovered = target;
  }

  private onDown(e: PointerEvent) {
    if (!this.enabled) return;
    const hit = this.pick(e);
    this.onCanvasDown?.(hit?.target ?? null);
    this.lastHit = hit;
    if (!hit) return;
    if (this.route('down', e, hit)) {
      this.captured = hit.target;
      this.canvas.setPointerCapture(e.pointerId);
    }
  }

  private onMove(e: PointerEvent) {
    if (!this.enabled) return;
    const hit = this.pick(e);
    if (this.captured) {
      if (hit?.target === this.captured) this.lastHit = hit;
      this.route('move', e, hit, this.captured);
      return;
    }
    this.setHover(hit?.target ?? null);
    if (hit) {
      this.lastHit = hit;
      this.route('hover', e, hit);
      const px = uvToPixel(hit.u, hit.v, hit.target.pixelWidth, hit.target.pixelHeight);
      this.canvas.style.cursor = hit.target.cursorAt?.(px.x, px.y) ?? 'default';
    } else {
      this.canvas.style.cursor = 'default';
    }
  }

  private onUp(e: PointerEvent) {
    if (!this.enabled) return;
    const hit = this.pick(e);
    if (this.captured) {
      const t = this.captured;
      this.captured = null;
      if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
      this.route('up', e, hit, t);
      return;
    }
    if (hit) this.route('up', e, hit);
  }

  private onWheel(e: WheelEvent) {
    if (!this.enabled) return;
    const hit = this.pick(e);
    if (hit && this.route('wheel', e, hit) !== false) e.preventDefault();
  }
}

function isWithin(obj: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = obj; o; o = o.parent) if (o === root) return true;
  return false;
}
