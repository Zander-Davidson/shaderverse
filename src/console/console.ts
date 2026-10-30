// The hanging control console (docs/hanging-rig.md): a wide, shallow tray
// below the portal, tipped back toward the pilot, in the same chrome bezel
// and gunmetal case as the monitors. Its printed face carries the section
// captions and legends; on it sit the eight knob slots and, below them, real
// 3D controls: square backlit buttons, lamps, toggles and a row of keys.
// Play, restart and the three quality buttons work; the rest are decorative
// but press and light like the real ones.

import * as THREE from 'three';
import type { LayoutConfig } from '../cockpit/layout';
import { consolePose } from '../cockpit/rig';
import { MonitorPanel } from '../panels/monitor';
import { redrawListenerRef, type PanelPointerEvent, type PointerTarget } from '../panels/panel';
import { PanelShape } from '../panels/shape';
import type { ProjectStore } from '../project/store';
import type { Quality } from '../shader/runtime';
import { chromeMaterial } from '../style/console';
import { physicalMaterial } from '../style/quality';
import { COLORS, MONO } from '../theme';
import type { KnobBank } from '../knobs/knobs';
import { KNOB_SLOTS } from '../project/schema';
import { buildBoard, FACE_HOLES } from './board';
import { EditDisplay } from './editDisplay';
import { BAKE_ALL, BAKE_KEY, BUBBLE_Y, BUTTON_Y, CAPTION_Y, consoleControls, EDIT_DISPLAY, KNOB_Y, knobLocal, LEGEND_Y, ROW_X, SECTIONS, type Control } from './plan';

const PX_PER_UNIT = 220;
const BEZEL = Math.round(0.16 * PX_PER_UNIT);

const redraw = (o: THREE.Object3D) => redrawListenerRef()?.(o);

/** Rounded rectangle shape, centered, in panel units. */
function roundedShape(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function keycap(w: number, h: number, depth: number): THREE.BufferGeometry {
  const bevel = Math.min(w, h) * 0.12;
  const g = new THREE.ExtrudeGeometry(roundedShape(w - 2 * bevel, h - 2 * bevel, Math.min(w, h) * 0.12), {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 4,
    curveSegments: 6,
  });
  g.translate(0, 0, bevel);
  return g;
}

const LENS_OFF = new THREE.Color('#0c1a1a');
const lensColor = (hex: string, k = 1) => new THREE.Color(hex).multiplyScalar(k);

/** One control on the console: its meshes, its press travel, and its lit state. */
class ConsoleControl implements PointerTarget {
  readonly group = new THREE.Group();
  readonly lens: THREE.MeshBasicMaterial | null = null;
  pixelWidth = 1;
  pixelHeight = 1;
  private pressed = false;
  /** Latching state for toggles and decorative buttons. */
  on = false;
  private readonly lever: THREE.Object3D | null = null;
  onPress: (() => void) | null = null;

  constructor(
    readonly control: Control,
    mats: { body: THREE.Material; key: THREE.Material; keyDark: THREE.Material; chrome: THREE.Material },
  ) {
    const c = control;
    this.group.position.set(c.x, c.y, 0);
    if (c.kind === 'button') {
      this.group.add(new THREE.Mesh(keycap(c.w * 0.9, c.h * 0.9, 0.1), mats.body));
      this.lens = new THREE.MeshBasicMaterial({ color: LENS_OFF.clone(), toneMapped: false });
      const lens = new THREE.Mesh(new THREE.PlaneGeometry(c.w * 0.62, c.h * 0.62), this.lens);
      lens.position.z = 0.1 + 2 * c.w * 0.9 * 0.12 + 0.002;
      this.group.add(lens);
    } else if (c.kind === 'key') {
      const i = Number(c.id.split('-')[1]);
      this.group.add(new THREE.Mesh(keycap(c.w, c.h, 0.06), i > 4 ? mats.keyDark : mats.key));
    } else if (c.kind === 'toggle') {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.05, 24).rotateX(Math.PI / 2), mats.chrome);
      base.position.z = 0.025;
      const lever = new THREE.Group();
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.2, 12), mats.chrome);
      stem.position.y = 0.1;
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 10), mats.body);
      tip.position.y = 0.2;
      lever.add(stem, tip);
      lever.position.z = 0.05;
      // Stands out of the face, thrown toward or away from the pilot.
      lever.rotation.x = Math.PI / 2 - 0.45;
      this.lever = lever;
      this.group.add(base, lever);
    } else {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(c.w * 0.5, 0.018, 10, 28), mats.chrome);
      ring.position.z = 0.012;
      this.lens = new THREE.MeshBasicMaterial({ color: LENS_OFF.clone(), toneMapped: false });
      const dome = new THREE.Mesh(new THREE.SphereGeometry(c.w * 0.45, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), this.lens);
      this.group.add(ring, dome);
    }
    this.group.traverse((o) => (o.raycast = c.kind === 'lamp' ? () => {} : o.raycast));
  }

  get meshes(): THREE.Object3D[] {
    return [this.group];
  }

  setLens(color: THREE.Color | null) {
    if (!this.lens) return;
    const next = color ?? LENS_OFF;
    if (this.lens.color.equals(next)) return;
    this.lens.color.copy(next);
    redraw(this.group);
  }

  private setPressed(p: boolean) {
    if (p === this.pressed) return;
    this.pressed = p;
    if (this.control.kind === 'toggle') return;
    this.group.position.z = p ? -0.035 : 0;
    redraw(this.group);
  }

  onPointer(e: PanelPointerEvent): boolean | void {
    if (e.kind === 'down' && e.button === 0) {
      this.setPressed(true);
      return true;
    }
    if (e.kind === 'up' && this.pressed) {
      this.setPressed(false);
      if (this.control.kind === 'toggle' && this.lever) {
        this.on = !this.on;
        this.lever.rotation.x = Math.PI / 2 + (this.on ? 0.45 : -0.45);
        redraw(this.group);
      } else if (!this.control.action) {
        this.on = !this.on;
      }
      this.onPress?.();
    }
  }

  cursorAt(): string {
    return 'pointer';
  }
}

export class ConsolePanel extends MonitorPanel {
  readonly controls: ConsoleControl[];
  readonly board: ReturnType<typeof buildBoard>;

  constructor(
    cfg: LayoutConfig,
    private readonly store: ProjectStore,
    knobs: KnobBank,
    /** Screen position of a world point, for the edit display's input layer. */
    project: ((p: THREE.Vector3) => { x: number; y: number }) | null = null,
  ) {
    const c = cfg.console;
    super(c, Math.round(c.w * PX_PER_UNIT), Math.round(c.h * PX_PER_UNIT), 'plate');
    this.board = buildBoard(KNOB_SLOTS, new EditDisplay(store, EDIT_DISPLAY, project));
    this.reshape(cfg);
    this.hang(cfg, c);
    this.rig.add(knobs.group);
    const mats = {
      body: physicalMaterial({ color: '#2b3034', metalness: 0.7, roughness: 0.38, clearcoat: 0.4, clearcoatRoughness: 0.2 }),
      key: physicalMaterial({ color: '#4a5056', metalness: 0.6, roughness: 0.42, clearcoat: 0.3 }),
      keyDark: physicalMaterial({ color: '#1a1d20', metalness: 0.5, roughness: 0.45, clearcoat: 0.3 }),
      chrome: chromeMaterial({ roughness: 0.1 }),
    };
    this.controls = consoleControls().map((ctl) => new ConsoleControl(ctl, mats));
    for (const ctl of this.controls) {
      this.rig.add(ctl.group);
      ctl.onPress = () => this.press(ctl);
    }
    const b = this.board;
    this.rig.add(b.display.group, b.bakeAll.group, b.key.group, ...b.bubbles.map((x) => x.group));
    for (const bubble of b.bubbles) bubble.onPress = () => this.bake(bubble.slot);
    this.syncLights();
    this.syncBoard();
    store.subscribe((s, p) => {
      if (s.project.playback !== p.project.playback || s.compile !== p.compile) this.syncLights();
      if (s.ui.editKnobId !== p.ui.editKnobId || s.project.knobs !== p.project.knobs) this.syncBoard();
    });
    void document.fonts?.ready.then(() => this.invalidate());
  }

  private last = 0;

  override update(): void {
    const now = performance.now();
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
    this.last = now;
    for (const b of this.board.bubbles) b.tick(dt);
    super.update();
    this.board.display.screen.update();
  }

  /** Every pointer target on the board: the display and the bake buttons. */
  get boardTargets(): PointerTarget[] {
    return [this.board.display.screen, ...this.board.bubbles];
  }

  /** The bubble under the knob in edit mode slides away from its button. */
  private syncBoard() {
    const { project, ui } = this.store.getState();
    const slot = project.knobs.find((k) => k.id === ui.editKnobId)?.slot ?? -1;
    for (const b of this.board.bubbles) b.setOpen(b.slot === slot);
  }

  /** A knob's bake button: its value goes into the code and the knob is gone. */
  private bake(slot: number) {
    const s = this.store.getState();
    const k = s.project.knobs.find((x) => x.slot === slot && x.id === s.ui.editKnobId);
    if (!k) return;
    const r = s.dispatch({ type: 'deleteKnob', id: k.id });
    if (!r.ok) this.board.display.screen.showError(r.error);
  }

  /** The face lets the pointer through its holes, to the display and buttons sunk in them. */
  override hitTest(x: number, y: number): boolean {
    if (!super.hitTest(x, y)) return false;
    const u = (x - this.pixelWidth / 2) / PX_PER_UNIT;
    const v = (this.pixelHeight / 2 - y) / PX_PER_UNIT;
    const d = FACE_HOLES.display;
    if (Math.abs(u - d.x) < d.w / 2 && Math.abs(v - d.y) < d.h / 2) return false;
    if (Math.hypot(u - BAKE_ALL.x, v - BAKE_ALL.y) < FACE_HOLES.bakeAll) return false;
    return !Array.from({ length: KNOB_SLOTS }, (_, i) => knobLocal(i)[0]).some((bx) => Math.hypot(u - bx, v - BUBBLE_Y) < FACE_HOLES.bubble);
  }

  /** The controls that take the pointer (lamps don't). */
  get targets(): PointerTarget[] {
    return this.controls.filter((c) => c.control.kind !== 'lamp');
  }

  relayout(cfg: LayoutConfig) {
    this.rect = { x: 0, y: 0, w: cfg.console.w, h: cfg.console.h };
    this.pixelWidth = this.canvas.width = Math.round(cfg.console.w * PX_PER_UNIT);
    this.pixelHeight = this.canvas.height = Math.round(cfg.console.h * PX_PER_UNIT);
    this.reshape(cfg);
    this.hang(cfg, cfg.console);
    this.invalidate();
  }

  /** Poses the console `rise` of the way up toward its leaned-in pose. */
  setRise(cfg: LayoutConfig, rise: number) {
    this.place(cfg, consolePose(cfg, rise));
  }

  private reshape(cfg: LayoutConfig) {
    const W = this.pixelWidth;
    this.setBezel(new PanelShape(W, this.pixelHeight, (cfg.cornerRadius / cfg.console.w) * W, null), BEZEL);
  }

  private press(ctl: ConsoleControl) {
    const s = this.store.getState();
    const a = ctl.control.action;
    if (a === 'play') s.dispatch({ type: 'setPlayback', playing: !s.project.playback.playing });
    else if (a === 'restart') s.dispatch({ type: 'restart' });
    else if (a?.startsWith('quality:')) s.dispatch({ type: 'setPlayback', quality: a.slice(8) as Quality });
    this.syncLights();
  }

  /** Backlights and lamps follow the playback and compile state. */
  private syncLights() {
    const { project, compile } = this.store.getState();
    const { playing, quality } = project.playback;
    for (const ctl of this.controls) {
      const id = ctl.control.id;
      if (id === 'play') ctl.setLens(playing ? lensColor('#3ff2c4', 1.1) : lensColor('#ffb35c', 1.1));
      else if (id === 'restart') ctl.setLens(lensColor('#9fb4bb', 0.5));
      else if (id.startsWith('q-')) ctl.setLens(id === `q-${quality}` ? lensColor('#3ff2c4', 1.2) : null);
      else if (id === 'lamp-compile')
        ctl.setLens(compile.status === 'ok' ? lensColor('#5dff9a', 1.3) : compile.status === 'error' ? lensColor('#ff4d3d', 1.4) : lensColor('#ffb35c', 1.2));
      else if (id === 'lamp-run') ctl.setLens(playing ? lensColor('#ffb35c', 1.2) : null);
    }
  }

  protected draw(ctx: CanvasRenderingContext2D): void {
    const W = this.pixelWidth;
    const H = this.pixelHeight;
    // Face coordinates: panel units from the center, y up.
    const px = (x: number) => W / 2 + x * PX_PER_UNIT;
    const py = (y: number) => H / 2 - y * PX_PER_UNIT;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1c2124');
    g.addColorStop(1, '#121618');
    this.shape!.begin(ctx, g);
    // Fine brushing across the face.
    ctx.globalAlpha = 0.05;
    for (let y = 0; y < H; y += 3) {
      ctx.fillStyle = (y * 7919) % 5 < 2 ? '#ffffff' : '#000000';
      ctx.fillRect(0, y, W, 1);
    }
    ctx.globalAlpha = 1;

    // The left bay: a shadowed apron around the edit display's recess.
    const d = FACE_HOLES.display;
    ctx.beginPath();
    ctx.roundRect(px(d.x - d.w / 2 - d.rim - 0.05), py(d.y + d.h / 2 + d.rim + 0.05), (d.w + 2 * d.rim + 0.1) * PX_PER_UNIT, (d.h + 2 * d.rim + 0.1) * PX_PER_UNIT, (d.r + d.rim + 0.05) * PX_PER_UNIT);
    ctx.fillStyle = '#0b0e10';
    ctx.fill();
    ctx.font = `700 22px ${MONO}`;
    ctx.fillStyle = COLORS.dim;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText('KNOB EDIT', px(d.x), py(LEGEND_Y));
    // A seam ring around each bubble's well.
    for (let i = 0; i < KNOB_SLOTS; i++) {
      ctx.beginPath();
      ctx.arc(px(knobLocal(i)[0]), py(BUBBLE_Y), (FACE_HOLES.bubble + 0.03) * PX_PER_UNIT, 0, Math.PI * 2);
      ctx.fillStyle = '#0a0d0e';
      ctx.fill();
    }
    // The right bay: the bake all button's guard plate, and the key's
    // engraving with OFF and ARM ticks either side of the slot.
    ctx.beginPath();
    ctx.arc(px(BAKE_ALL.x), py(BAKE_ALL.y), (FACE_HOLES.bakeAll + 0.07) * PX_PER_UNIT, 0, Math.PI * 2);
    ctx.fillStyle = '#0a0d0e';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#3a2d10';
    ctx.setLineDash([18, 12]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.textAlign = 'center';
    ctx.font = `800 30px ${MONO}`;
    ctx.fillStyle = '#8b98a0';
    ctx.fillText('BAKE', px(BAKE_KEY.x), py(BAKE_KEY.y + BAKE_KEY.r + 0.33));
    ctx.font = `700 18px ${MONO}`;
    ctx.fillStyle = COLORS.dim;
    const kr = BAKE_KEY.r + 0.12;
    ctx.fillText('OFF', px(BAKE_KEY.x), py(BAKE_KEY.y + kr + 0.01) - 2);
    ctx.fillText('ARM', px(BAKE_KEY.x + kr + 0.13), py(BAKE_KEY.y));
    ctx.fillStyle = '#5a6a72';
    ctx.fillRect(px(BAKE_KEY.x) - 2, py(BAKE_KEY.y + kr - 0.05), 4, 0.07 * PX_PER_UNIT);
    ctx.fillRect(px(BAKE_KEY.x + kr - 0.05), py(BAKE_KEY.y) - 2, 0.07 * PX_PER_UNIT, 4);

    // Under each button, toggle and lamp, a dark socket.
    for (const c of consoleControls()) {
      if (c.kind === 'key') continue;
      const s = c.kind === 'button' ? c.w * 1.02 : c.kind === 'toggle' ? 0.26 : 0.3;
      ctx.beginPath();
      ctx.roundRect(px(c.x - s / 2), py(c.y + (c.kind === 'toggle' ? 0.24 : s / 2)), s * PX_PER_UNIT, (c.kind === 'toggle' ? 0.48 : s) * PX_PER_UNIT, 10);
      ctx.fillStyle = '#080b0c';
      ctx.fill();
    }
    // A tray under the keys.
    ctx.beginPath();
    ctx.roundRect(px(ROW_X + 1.22), py(BUTTON_Y + 0.29), px(ROW_X + 3.32) - px(ROW_X + 1.22), 0.58 * PX_PER_UNIT, 12);
    ctx.fillStyle = '#07090a';
    ctx.fill();

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.font = `700 26px ${MONO}`;
    ctx.fillStyle = '#7f949b';
    for (const c of consoleControls()) if (c.legend) ctx.fillText(c.legend, px(c.x), py(LEGEND_Y));
    // Section captions with a rule running right from each.
    ctx.textAlign = 'left';
    ctx.font = `700 22px ${MONO}`;
    for (const s of SECTIONS) {
      const y = py(CAPTION_Y);
      ctx.fillStyle = COLORS.dim;
      ctx.fillText(s.text, px(s.x), y);
      const x0 = px(s.x) + ctx.measureText(s.text).width + 10;
      ctx.fillStyle = '#2a3337';
      ctx.fillRect(x0, y - 1, px(s.end) - x0, 2);
    }
    // Maker's plate and slot numbers.
    ctx.font = `600 20px ${MONO}`;
    ctx.fillStyle = '#4a5a60';
    ctx.textAlign = 'right';
    ctx.fillText('SHADERVERSE · CONTROL C/7', px(ROW_X + 3.3), py(LEGEND_Y));
    ctx.textAlign = 'left';
    ctx.fillText('PARAM', px(ROW_X - 3.35), py(KNOB_Y + 0.45));
    this.shape!.finish(ctx, '#0a0d0e');
    // Open the face where the display, the bubbles and the bake all button
    // sink below it (transparent pixels are discarded, so the wells show).
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.roundRect(px(d.x - d.w / 2), py(d.y + d.h / 2), d.w * PX_PER_UNIT, d.h * PX_PER_UNIT, d.r * PX_PER_UNIT);
    for (let i = 0; i < KNOB_SLOTS; i++) {
      ctx.moveTo(px(knobLocal(i)[0]) + FACE_HOLES.bubble * PX_PER_UNIT, py(BUBBLE_Y));
      ctx.arc(px(knobLocal(i)[0]), py(BUBBLE_Y), FACE_HOLES.bubble * PX_PER_UNIT, 0, Math.PI * 2);
    }
    ctx.moveTo(px(BAKE_ALL.x) + FACE_HOLES.bakeAll * PX_PER_UNIT, py(BAKE_ALL.y));
    ctx.arc(px(BAKE_ALL.x), py(BAKE_ALL.y), FACE_HOLES.bakeAll * PX_PER_UNIT, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
}
