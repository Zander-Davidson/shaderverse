// A panel is a flat 2D surface with its own pixel coordinates, drawn into a
// texture that is mapped onto a sphere patch. Panels never know they are curved.

import * as THREE from 'three';
import type { Rect } from '../cockpit/layout';
import { spherePatchGeometry } from './patch';
import { screenShapeFor, type PanelShape } from './shape';
import type { PanelMold } from '../style/console';

export type PanelPointerKind = 'down' | 'move' | 'up' | 'wheel' | 'hover' | 'leave' | 'dblclick' | 'contextmenu';

export interface PanelPointerEvent {
  kind: PanelPointerKind;
  /** Panel pixel coordinates (y down); NaN for 'leave'. */
  x: number;
  y: number;
  /** Raw texture coordinate (v up). */
  u: number;
  v: number;
  clientX: number;
  clientY: number;
  button: number;
  buttons: number;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  deltaY: number;
  /** True when the pointer is captured by this panel (dragging off it). */
  captured: boolean;
}

export interface PointerTarget {
  /** Meshes that, when hit, route to this target. */
  readonly meshes: THREE.Object3D[];
  pixelWidth: number;
  pixelHeight: number;
  /** Return true to capture the pointer until 'up'. */
  onPointer(e: PanelPointerEvent): boolean | void;
  cursorAt?(x: number, y: number): string;
  /** False for pixels outside the panel's silhouette; the pick passes through. */
  hitTest?(x: number, y: number): boolean;
}

export interface Button {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Called after any panel redraws its texture (the compositor marks it dirty). */
let redrawListener: ((mesh: THREE.Object3D) => void) | null = null;
export function onPanelRedraw(fn: ((mesh: THREE.Object3D) => void) | null): void {
  redrawListener = fn;
}
/** The current listener, for other scene objects that change (knob caps). */
export const redrawListenerRef = () => redrawListener;

export abstract class CanvasPanel implements PointerTarget {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly texture: THREE.CanvasTexture;
  readonly material: THREE.MeshBasicMaterial;
  readonly mesh: THREE.Mesh;
  protected buttons: Button[] = [];
  protected hoverButton: string | null = null;
  private dirty = true;

  constructor(
    public rect: Rect,
    public pixelWidth: number,
    public pixelHeight: number,
    radius: number,
    protected inset = 0.01,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = pixelWidth;
    this.canvas.height = pixelHeight;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.generateMipmaps = true;
    // alphaTest discards fully transparent pixels, so a panel's empty corners
    // don't write depth and hide what's behind them.
    this.material = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, alphaTest: 0.01, toneMapped: false });
    this.mesh = new THREE.Mesh(this.geometryFor(radius), this.material);
  }

  get meshes(): THREE.Object3D[] {
    return [this.mesh];
  }

  protected geometryFor(radius: number): THREE.BufferGeometry {
    const r = this.rect;
    return spherePatchGeometry(r.x, r.y, r.w, r.h, radius, this.inset);
  }

  /** Rebuilds the mesh for a new sphere radius or rect (dev tuning). */
  rebuild(radius: number, rect = this.rect): void {
    this.rect = rect;
    this.mesh.geometry.dispose();
    this.mesh.geometry = this.geometryFor(radius);
  }

  setAnisotropy(n: number): void {
    this.texture.anisotropy = n;
  }

  invalidate(): void {
    this.dirty = true;
  }

  /** Redraws the texture if something changed. */
  update(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.buttons = [];
    this.draw(this.ctx);
    this.texture.needsUpdate = true;
    redrawListener?.(this.mesh);
  }

  protected abstract draw(ctx: CanvasRenderingContext2D): void;

  /** Registers a button drawn at screen-relative coordinates. */
  protected addButton(b: Button): void {
    this.buttons.push({ ...b, x: b.x + this.ox, y: b.y + this.oy });
  }

  protected buttonAt(x: number, y: number): Button | undefined {
    return this.buttons.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
  }

  protected onButton(_id: string): void {}

  onPointer(e: PanelPointerEvent): boolean | void {
    if (e.kind === 'hover' || e.kind === 'move' || e.kind === 'leave') {
      const id = e.kind === 'leave' ? null : (this.buttonAt(e.x, e.y)?.id ?? null);
      if (id !== this.hoverButton) {
        this.hoverButton = id;
        this.invalidate();
      }
    }
    if (e.kind === 'up' && e.button === 0) {
      const b = this.buttonAt(e.x, e.y);
      if (b) this.onButton(b.id);
    }
  }

  cursorAt(x: number, y: number): string {
    return this.buttonAt(x, y) ? 'pointer' : 'default';
  }

  /** The screen opening content is drawn in (the whole silhouette without a bezel). */
  shape: PanelShape | null = null;
  /** The outer silhouette, bezel included. */
  outerShape: PanelShape | null = null;
  /** Width in pixels of the bezel molded into the console around the screen; 0 for none. */
  bezel = 0;

  hitTest(x: number, y: number): boolean {
    const s = this.outerShape ?? this.shape;
    return s ? s.contains(x, y) : true;
  }

  /** Screen origin in panel pixels: content is drawn relative to it. */
  get ox(): number {
    return this.bezel ? this.shape!.inset : 0;
  }

  get oy(): number {
    return this.ox;
  }

  /** Width and height of the screen area content is laid out in. */
  get iw(): number {
    return this.pixelWidth - 2 * this.ox;
  }

  get ih(): number {
    return this.pixelHeight - 2 * this.oy;
  }

  /**
   * Sets the screen inside a bezel: the console molds the bezel (see
   * ChromeConsole) and content lays out in the opening, `bezel` pixels inside
   * `outer`.
   */
  setBezel(outer: PanelShape, bezel: number): void {
    this.outerShape = outer;
    this.shape = screenShapeFor(outer, bezel);
    if (!this.bezel) {
      // The screen's edge is tucked under the console's lip, so it can be
      // opaque: drawn front to back, it hides what's behind it early.
      this.material.transparent = false;
      this.material.alphaTest = 0.5;
      this.material.needsUpdate = true;
    }
    this.bezel = bezel;
  }

  /** The bezel to mold into the console, if this panel has one. */
  mold(): PanelMold | null {
    if (!this.bezel) return null;
    return { rect: this.rect, pixelWidth: this.pixelWidth, pixelHeight: this.pixelHeight, outer: this.outerShape!, screen: this.shape! };
  }
}
