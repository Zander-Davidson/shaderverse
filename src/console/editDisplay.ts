// The knob edit display (docs/control-board.md): a small screen sunk into
// the console's left bay, where the knob in edit mode has its settings
// edited. Powered down, it's dark glass. Fields take keystrokes through an
// invisible input laid over them on screen, as the in-scene editor does; the
// display draws the text, selection and caret.

import * as THREE from 'three';
import { formatValue } from '../knobs/knobs';
import { CanvasPanel } from '../panels/panel';
import type { KnobRecord } from '../project/schema';
import type { ProjectStore } from '../project/store';
import { COLORS, KNOB_EDIT_TINT, MONO } from '../theme';

const PX_PER_UNIT = 300;
const POWER_ON_S = 0.22;
const POWER_OFF_S = 0.16;
/** How long switching knobs takes, the screen shifting over in blocks. */
const SHIFT_S = 0.34;
const BLOCK = 24;

type Field = 'label' | 'param' | 'min' | 'max' | 'step';
const FIELDS: Field[] = ['label', 'param', 'min', 'max', 'step'];

/** Where things sit on the screen, in its pixels. */
const PAD = 26;
const ROW = 66;
const rowY = (i: number) => 78 + i * ROW;

const fieldValue = (k: KnobRecord, f: Field): string => (f === 'param' ? k.param : String(k[f]));

const hash = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export class EditDisplay extends CanvasPanel {
  readonly group = new THREE.Group();
  private readonly input: HTMLInputElement;
  /** The knob shown: the one in edit mode, or the last one while powering down. */
  private shown: KnobRecord | null = null;
  private power = 0;
  private powerGoal = 0;
  /** The previous knob's screen while shifting to the next one. */
  private shift: { from: HTMLCanvasElement; t: number } | null = null;
  private focus: Field | null = null;
  /** Edited text that didn't commit; kept until it's fixed or reverted. */
  private drafts: Partial<Record<Field, string>> = {};
  private error = '';
  private last = 0;

  constructor(
    private readonly store: ProjectStore,
    size: { w: number; h: number },
    /** Screen position of a world point, for laying the input over a field. */
    private readonly project: ((p: THREE.Vector3) => { x: number; y: number }) | null = null,
  ) {
    super({ x: 0, y: 0, w: size.w, h: size.h }, Math.round(size.w * PX_PER_UNIT), Math.round(size.h * PX_PER_UNIT), 0, 0);
    this.material.alphaTest = 0;
    this.material.transparent = false;
    this.group.add(this.mesh);

    this.input = document.createElement('input');
    this.input.className = 'sv-display-input';
    this.input.setAttribute('aria-label', 'Knob setting');
    this.input.autocomplete = 'off';
    this.input.spellcheck = false;
    document.body.appendChild(this.input);
    const redraw = () => this.invalidate();
    for (const ev of ['input', 'select', 'keyup', 'pointerup']) this.input.addEventListener(ev, redraw);
    document.addEventListener('selectionchange', () => this.focus && redraw());
    this.input.addEventListener('keydown', (e) => this.onKey(e));
    this.input.addEventListener('blur', () => {
      // Clicking away commits, like the old popover's change event.
      if (this.focus) this.commit();
      this.focus = null;
      this.invalidate();
    });

    store.subscribe((s, prev) => {
      if (s.ui.editKnobId !== prev.ui.editKnobId) this.switchTo(s.ui.editKnobId);
      else if (s.project.knobs !== prev.project.knobs && this.knob) {
        this.shown = this.knob;
        this.invalidate();
      }
    });
  }

  protected override geometryFor(): THREE.BufferGeometry {
    return new THREE.PlaneGeometry(this.rect.w, this.rect.h);
  }

  /** The knob in edit mode, fresh from the store. */
  private get knob(): KnobRecord | null {
    const { project, ui } = this.store.getState();
    return project.knobs.find((k) => k.id === ui.editKnobId) ?? null;
  }

  /** The field being typed into, if any. */
  get focused(): Field | null {
    return this.focus;
  }

  private switchTo(id: string | null) {
    const next = this.knob;
    if (this.focus) this.input.blur();
    this.drafts = {};
    this.error = '';
    if (!id || !next) {
      this.powerGoal = 0;
    } else {
      if (this.power > 0 && this.shown && this.shown.id !== next.id) {
        // Snapshot the old screen and shift over to the new one.
        const from = document.createElement('canvas');
        from.width = this.pixelWidth;
        from.height = this.pixelHeight;
        from.getContext('2d')!.drawImage(this.canvas, 0, 0);
        this.shift = { from, t: 0 };
      }
      this.shown = next;
      this.powerGoal = 1;
    }
    this.invalidate();
  }

  /** Advances the power-up and block-shift animations. */
  override update(): void {
    const now = performance.now();
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
    this.last = now;
    if (this.power !== this.powerGoal) {
      this.power = this.powerGoal > this.power ? Math.min(1, this.power + dt / POWER_ON_S) : Math.max(0, this.power - dt / POWER_OFF_S);
      if (this.power === 0) this.shown = null;
      this.invalidate();
    }
    if (this.shift) {
      this.shift.t += dt / SHIFT_S;
      if (this.shift.t >= 1) this.shift = null;
      this.invalidate();
    }
    if (this.focus) this.placeInput();
    super.update();
  }

  // --- Fields ---------------------------------------------------------------

  private fieldRect(f: Field) {
    const W = this.pixelWidth;
    const x0 = PAD + 122;
    const half = (W - x0 - PAD - 116) / 2;
    switch (f) {
      case 'label':
        return { x: x0, y: rowY(1), w: W - x0 - PAD, h: 50 };
      case 'param':
        return { x: x0, y: rowY(2), w: W - x0 - PAD, h: 50 };
      case 'min':
        return { x: x0, y: rowY(3), w: half, h: 50 };
      case 'max':
        return { x: W - PAD - half, y: rowY(3), w: half, h: 50 };
      case 'step':
        return { x: x0, y: rowY(4), w: half, h: 50 };
    }
  }

  protected override onButton(id: string): void {
    const k = this.knob;
    if (!k) return;
    if (id === 'reset') {
      this.store.getState().dispatch({ type: 'resetKnob', id: k.id });
    } else if (id.startsWith('field:')) {
      this.focusField(id.slice(6) as Field);
    }
  }

  override cursorAt(x: number, y: number): string {
    const b = this.knob && this.buttonAt(x, y);
    return b ? (b.id === 'reset' ? 'pointer' : 'text') : 'default';
  }

  private focusField(f: Field) {
    const k = this.knob;
    if (!k) return;
    if (this.focus && this.focus !== f) this.commit();
    this.focus = f;
    this.input.value = this.drafts[f] ?? fieldValue(k, f);
    this.input.inputMode = f === 'label' || f === 'param' ? 'text' : 'decimal';
    this.placeInput();
    this.input.focus({ preventScroll: true });
    this.input.select();
    this.invalidate();
  }

  /** World position of a field's middle, or of RESET VALUE (for tests). */
  pointOf(id: Field | 'reset'): THREE.Vector3 {
    const r = id === 'reset' ? { x: PAD, y: rowY(6), w: 250, h: 50 } : this.fieldRect(id);
    const u = (r.x + r.w / 2) / this.pixelWidth - 0.5;
    const v = 0.5 - (r.y + r.h / 2) / this.pixelHeight;
    return this.mesh.localToWorld(new THREE.Vector3(u * this.rect.w, v * this.rect.h, 0));
  }

  private placeInput() {
    if (!this.focus || !this.project) return;
    const r = this.fieldRect(this.focus);
    const corner = (px: number, py: number) =>
      this.project!(this.mesh.localToWorld(new THREE.Vector3((px / this.pixelWidth - 0.5) * this.rect.w, (0.5 - py / this.pixelHeight) * this.rect.h, 0)));
    const a = corner(r.x, r.y);
    const b = corner(r.x + r.w, r.y + r.h);
    Object.assign(this.input.style, {
      left: `${Math.min(a.x, b.x)}px`,
      top: `${Math.min(a.y, b.y)}px`,
      width: `${Math.max(20, Math.abs(b.x - a.x))}px`,
      height: `${Math.max(10, Math.abs(b.y - a.y))}px`,
    });
  }

  private onKey(e: KeyboardEvent) {
    // The display owns these keys; nothing global should see them.
    e.stopPropagation();
    const f = this.focus;
    if (!f) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      delete this.drafts[f];
      this.error = '';
      this.focus = null;
      this.input.blur();
      this.invalidate();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (!this.commit()) return;
      const i = FIELDS.indexOf(f);
      const next = FIELDS[(i + (e.shiftKey ? FIELDS.length - 1 : 1)) % FIELDS.length]!;
      this.focusField(next);
    }
  }

  /** Applies the focused field. False, with the error shown, if the store refused it. */
  private commit(): boolean {
    const f = this.focus;
    const k = this.knob;
    if (!f || !k) return true;
    const text = this.input.value;
    const dispatch = this.store.getState().dispatch;
    const refuse = (error: string) => {
      this.drafts[f] = text;
      this.error = error;
      this.invalidate();
      return false;
    };
    if (text === fieldValue(k, f)) {
      delete this.drafts[f];
      this.error = '';
      return true;
    }
    if (f === 'param') {
      const name = text.trim();
      const r = name ? dispatch({ type: 'renameKnob', id: k.id, name }) : { ok: false as const, error: 'The name cannot be empty.' };
      if (!r.ok) return refuse(r.error);
    } else if (f === 'label') {
      const r = dispatch({ type: 'updateKnob', id: k.id, patch: { label: text } });
      if (!r.ok) return refuse(r.error);
    } else {
      const n = Number(text.trim());
      if (!text.trim() || !Number.isFinite(n)) return refuse(`${f.toUpperCase()} must be a number.`);
      const r = dispatch({ type: 'updateKnob', id: k.id, patch: { [f]: n } });
      if (!r.ok) return refuse(r.error);
      // Keep the value inside the new range.
      const u = this.knob;
      if (u && (u.value < u.min || u.value > u.max)) {
        dispatch({ type: 'setKnobValue', id: u.id, value: Math.min(u.max, Math.max(u.min, u.value)) });
      }
    }
    delete this.drafts[f];
    this.error = '';
    this.invalidate();
    return true;
  }

  // --- Drawing --------------------------------------------------------------

  protected draw(ctx: CanvasRenderingContext2D): void {
    const W = this.pixelWidth;
    const H = this.pixelHeight;
    this.glass(ctx);
    const k = this.shown;
    if (k && this.power > 0) {
      ctx.save();
      // Powering up: the picture opens from a bright line across the middle.
      const p = this.power;
      const open = Math.min(1, p * 1.6);
      const h = Math.max(2, H * open * open);
      ctx.beginPath();
      ctx.rect(0, (H - h) / 2, W, h);
      ctx.clip();
      this.page(ctx, k);
      if (p < 1) {
        ctx.fillStyle = `rgba(255, 240, 200, ${0.55 * (1 - p)})`;
        ctx.fillRect(0, 0, W, H);
      }
      ctx.restore();
    }
    if (this.shift) this.blocks(ctx, this.shift.from, this.shift.t);
    this.scanlines(ctx);
  }

  private glass(ctx: CanvasRenderingContext2D) {
    const W = this.pixelWidth;
    const H = this.pixelHeight;
    const g = ctx.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.5, W * 0.75);
    g.addColorStop(0, this.power > 0 ? '#121410' : '#0b1313');
    g.addColorStop(1, '#030606');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  private scanlines(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = this.power > 0 ? 'rgba(0, 0, 0, 0.22)' : 'rgba(120, 160, 160, 0.035)';
    for (let y = 0; y < this.pixelHeight; y += 4) ctx.fillRect(0, y, this.pixelWidth, 1);
  }

  /** The old screen breaking into blocks that slide off as the new one shows through. */
  private blocks(ctx: CanvasRenderingContext2D, from: HTMLCanvasElement, t: number) {
    const cols = Math.ceil(this.pixelWidth / BLOCK);
    const rows = Math.ceil(this.pixelHeight / BLOCK);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const n = j * cols + i;
        const start = hash(n) * 0.6;
        const local = Math.min(1, Math.max(0, (t - start) / 0.4));
        if (local >= 1) continue;
        const dir = hash(n + 9999) < 0.5 ? -1 : 1;
        const dx = Math.round(dir * local * local * BLOCK * 3);
        ctx.drawImage(from, i * BLOCK, j * BLOCK, BLOCK, BLOCK, i * BLOCK + dx, j * BLOCK, BLOCK, BLOCK);
      }
    }
  }

  private page(ctx: CanvasRenderingContext2D, k: KnobRecord) {
    const W = this.pixelWidth;
    const H = this.pixelHeight;
    const y = (i: number) => rowY(i) + 25;
    ctx.textBaseline = 'middle';

    // Header: which knob, its type, and the edit lamp.
    ctx.textAlign = 'left';
    ctx.font = `700 28px ${MONO}`;
    ctx.fillStyle = KNOB_EDIT_TINT;
    ctx.fillText(`KNOB ${k.slot + 1} · ${k.type.toUpperCase()}`, PAD, 38);
    ctx.textAlign = 'right';
    ctx.fillText('EDIT', W - PAD, 38);
    ctx.beginPath();
    ctx.arc(W - PAD - ctx.measureText('EDIT').width - 18, 38, 8, 0, Math.PI * 2);
    ctx.shadowColor = KNOB_EDIT_TINT;
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = `${KNOB_EDIT_TINT}55`;
    ctx.fillRect(PAD, 66, W - 2 * PAD, 2);

    const caption = (text: string, x: number, row: number) => {
      ctx.textAlign = 'left';
      ctx.font = `600 22px ${MONO}`;
      ctx.fillStyle = COLORS.dim;
      ctx.fillText(text, x, y(row));
    };
    caption('LABEL', PAD, 1);
    caption('NAME', PAD, 2);
    caption('MIN', PAD, 3);
    caption('MAX', this.fieldRect('max').x - 62, 3);
    caption('STEP', PAD, 4);
    for (const f of FIELDS) this.field(ctx, k, f);

    // Readouts: the value follows the knob live.
    caption('VALUE', PAD, 5);
    caption('DEFAULT', this.fieldRect('max').x - 108, 5);
    ctx.font = `600 28px ${MONO}`;
    ctx.fillStyle = COLORS.text;
    ctx.fillText(formatValue(k, k.value), this.fieldRect('min').x + 10, y(5));
    ctx.fillStyle = COLORS.dim;
    ctx.fillText(formatValue(k, k.default), this.fieldRect('max').x + 10, y(5));

    // RESET VALUE, an on-screen button.
    const b = { id: 'reset', x: PAD, y: rowY(6), w: 250, h: 50 };
    this.addButton(b);
    const hot = this.hoverButton === 'reset';
    ctx.beginPath();
    ctx.roundRect(b.x, b.y, b.w, b.h, 6);
    ctx.fillStyle = hot ? `${KNOB_EDIT_TINT}33` : 'transparent';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = hot ? KNOB_EDIT_TINT : `${KNOB_EDIT_TINT}88`;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = `700 22px ${MONO}`;
    ctx.fillStyle = hot ? KNOB_EDIT_TINT : `${KNOB_EDIT_TINT}cc`;
    ctx.fillText('RESET VALUE', b.x + b.w / 2, b.y + b.h / 2 + 1);

    // The bottom line: errors from the store, or a hint.
    ctx.textAlign = 'left';
    ctx.font = `600 18px ${MONO}`;
    ctx.fillStyle = this.error ? COLORS.error : COLORS.faint;
    const msg = this.error || (this.focus ? 'ENTER/TAB NEXT · ESC REVERT' : 'CLICK A FIELD TO EDIT');
    ctx.fillText(this.fit(ctx, msg, W - 2 * PAD), PAD, H - 24);
  }

  private field(ctx: CanvasRenderingContext2D, k: KnobRecord, f: Field) {
    const r = this.fieldRect(f);
    this.addButton({ id: `field:${f}`, ...r });
    const focused = this.focus === f;
    const draft = this.drafts[f];
    const text = focused ? this.input.value : (draft ?? fieldValue(k, f));
    const hot = this.hoverButton === `field:${f}`;
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, 4);
    ctx.fillStyle = focused ? '#1a1a10' : '#0b0e0c';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = focused ? KNOB_EDIT_TINT : draft !== undefined ? COLORS.error : hot ? `${KNOB_EDIT_TINT}88` : '#2a3330';
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x + 4, r.y, r.w - 8, r.h);
    ctx.clip();
    ctx.font = `600 28px ${MONO}`;
    ctx.textAlign = 'left';
    const tx = r.x + 10;
    const ty = r.y + r.h / 2 + 1;
    if (focused) {
      const s = this.input.selectionStart ?? text.length;
      const e = this.input.selectionEnd ?? s;
      const xa = tx + ctx.measureText(text.slice(0, Math.min(s, e))).width;
      const xb = tx + ctx.measureText(text.slice(0, Math.max(s, e))).width;
      if (xb > xa) {
        ctx.fillStyle = `${KNOB_EDIT_TINT}55`;
        ctx.fillRect(xa, r.y + 8, xb - xa, r.h - 16);
      }
      ctx.fillStyle = '#fff6dc';
      ctx.fillText(text, tx, ty);
      // Caret at the selection's moving end.
      const cx = tx + ctx.measureText(text.slice(0, this.input.selectionDirection === 'backward' ? s : e)).width;
      ctx.fillStyle = KNOB_EDIT_TINT;
      ctx.fillRect(cx, r.y + 8, 3, r.h - 16);
    } else {
      ctx.fillStyle = f === 'param' ? KNOB_EDIT_TINT : COLORS.text;
      ctx.fillText(text, tx, ty);
    }
    ctx.restore();
  }

  private fit(ctx: CanvasRenderingContext2D, text: string, w: number) {
    let t = text;
    while (t.length > 1 && ctx.measureText(t).width > w) t = `${t.slice(0, -2)}…`;
    return t;
  }
}
