// The knob edit display (docs/control-board.md): a small screen sunk into
// the console's left bay, where the knob in edit mode has its name and range
// edited. Powered down, it's dark glass; it changes pages with the monitors'
// page change. Fields take keystrokes through an invisible input laid over
// them on screen, as the in-scene editor does; the display draws the text,
// selection and caret.

import * as THREE from 'three';
import { formatValue } from '../knobs/knobs';
import { PageChange } from '../panels/pageChange';
import { CanvasPanel, redrawListenerRef } from '../panels/panel';
import type { KnobRecord } from '../project/schema';
import type { ProjectStore } from '../project/store';
import { COLORS, KNOB_EDIT_TINT, MONO } from '../theme';

const PX_PER_UNIT = 300;

/** The knob's name (its parameter, and the label on its strip) and range. */
type Field = 'param' | 'min' | 'max' | 'step';
const FIELDS: Field[] = ['param', 'min', 'max', 'step'];

/** Where things sit on the screen, in its pixels, and how big the text is. */
const PAD = 18;
const ROW = 78;
const rowY = (i: number) => 10 + i * ROW;
const FIELD_H = 60;
/** Field text and readouts; captions; the header; the hint and error line. */
const TEXT = 42;
const CAPTION = 27;
const HEADER = 34;
const HINT = 24;
/** Left of the fields, for their captions; and between MIN and MAX. */
const CAPTION_W = 92;
const GAP_W = 64;
const RESET = { w: 300, h: FIELD_H };

const fieldValue = (k: KnobRecord, f: Field): string => (f === 'param' ? k.param : String(k[f]));

export class EditDisplay extends CanvasPanel {
  readonly group = new THREE.Group();
  private readonly input: HTMLInputElement;
  /** The knob shown: the one in edit mode, or null when the display is off. */
  private shown: KnobRecord | null = null;
  private readonly pageChange = new PageChange();
  private focus: Field | null = null;
  /** Edited text that didn't commit; kept until it's fixed or reverted. */
  private drafts: Partial<Record<Field, string>> = {};
  private error = '';

  constructor(
    private readonly store: ProjectStore,
    size: { w: number; h: number },
    /** Screen position of a world point, for laying the input over a field. */
    private readonly project: ((p: THREE.Vector3) => { x: number; y: number }) | null = null,
  ) {
    super({ x: 0, y: 0, w: size.w, h: size.h }, Math.round(size.w * PX_PER_UNIT), Math.round(size.h * PX_PER_UNIT), 0, 0);
    this.material.alphaTest = 0;
    this.material.transparent = false;
    this.pageChange.resize(this.pixelWidth, this.pixelHeight);
    this.pageChange.install(this.material, 'page-change-display');
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
    // On, off or to another knob: the page change from what shows now.
    this.pageChange.begin(this.canvas);
    this.shown = id ? next : null;
    this.invalidate();
  }

  override update(): void {
    if (this.focus) this.placeInput();
    super.update();
    // The screen changes every frame until the new page settles.
    if (this.pageChange.tick()) redrawListenerRef()?.(this.mesh);
  }

  // --- Fields ---------------------------------------------------------------

  private fieldRect(f: Field) {
    const W = this.pixelWidth;
    const x0 = PAD + CAPTION_W;
    const half = (W - x0 - PAD - GAP_W) / 2;
    switch (f) {
      case 'param':
        return { x: x0, y: rowY(1), w: W - x0 - PAD, h: FIELD_H };
      case 'min':
        return { x: x0, y: rowY(2), w: half, h: FIELD_H };
      case 'max':
        return { x: W - PAD - half, y: rowY(2), w: half, h: FIELD_H };
      case 'step':
        return { x: x0, y: rowY(3), w: half, h: FIELD_H };
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
    this.input.inputMode = f === 'param' ? 'text' : 'decimal';
    this.placeInput();
    this.input.focus({ preventScroll: true });
    this.input.select();
    this.invalidate();
  }

  /** Shows an error from outside the display (a refused bake) on its bottom line. */
  showError(error: string) {
    this.error = error;
    this.invalidate();
  }

  /** World position of a field's middle, or of RESET VALUE (for tests). */
  pointOf(id: Field | 'reset'): THREE.Vector3 {
    const r = id === 'reset' ? { x: PAD, y: rowY(5), ...RESET } : this.fieldRect(id);
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
      // One name: the parameter in the code, and the label on the knob's strip.
      const name = text.trim();
      const r = name ? dispatch({ type: 'renameKnob', id: k.id, name }) : { ok: false as const, error: 'The name cannot be empty.' };
      if (!r.ok) return refuse(r.error);
      if (this.knob && this.knob.label !== name) dispatch({ type: 'updateKnob', id: k.id, patch: { label: name } });
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
    this.glass(ctx);
    if (this.shown) this.page(ctx, this.shown);
    this.scanlines(ctx);
  }

  private glass(ctx: CanvasRenderingContext2D) {
    const W = this.pixelWidth;
    const H = this.pixelHeight;
    const g = ctx.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.5, W * 0.75);
    g.addColorStop(0, this.shown ? '#121410' : '#0b1313');
    g.addColorStop(1, '#030606');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  private scanlines(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = this.shown ? 'rgba(0, 0, 0, 0.22)' : 'rgba(120, 160, 160, 0.035)';
    for (let y = 0; y < this.pixelHeight; y += 4) ctx.fillRect(0, y, this.pixelWidth, 1);
  }

  private page(ctx: CanvasRenderingContext2D, k: KnobRecord) {
    const W = this.pixelWidth;
    const H = this.pixelHeight;
    const y = (i: number) => rowY(i) + FIELD_H / 2;
    ctx.textBaseline = 'middle';

    // Header: which knob, its type, and the edit lamp.
    ctx.textAlign = 'left';
    ctx.font = `700 ${HEADER}px ${MONO}`;
    ctx.fillStyle = KNOB_EDIT_TINT;
    ctx.fillText(`KNOB ${k.slot + 1} · ${k.type.toUpperCase()}`, PAD, 36);
    ctx.textAlign = 'right';
    ctx.fillText('EDIT', W - PAD, 36);
    ctx.beginPath();
    ctx.arc(W - PAD - ctx.measureText('EDIT').width - 20, 36, 9, 0, Math.PI * 2);
    ctx.shadowColor = KNOB_EDIT_TINT;
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = `${KNOB_EDIT_TINT}55`;
    ctx.fillRect(PAD, 66, W - 2 * PAD, 3);

    const caption = (text: string, x: number, row: number) => {
      ctx.textAlign = 'left';
      ctx.font = `600 ${CAPTION}px ${MONO}`;
      ctx.fillStyle = COLORS.dim;
      ctx.fillText(text, x, y(row));
    };
    caption('NAME', PAD, 1);
    caption('MIN', PAD, 2);
    caption('MAX', this.fieldRect('max').x - GAP_W + 6, 2);
    caption('STEP', PAD, 3);
    for (const f of FIELDS) this.field(ctx, k, f);

    // Readouts: the value follows the knob live.
    caption('VALUE', PAD, 4);
    caption('DEF', this.fieldRect('max').x - GAP_W + 6, 4);
    ctx.font = `600 ${TEXT}px ${MONO}`;
    ctx.fillStyle = COLORS.text;
    ctx.fillText(formatValue(k, k.value), this.fieldRect('min').x + 10, y(4));
    ctx.fillStyle = COLORS.dim;
    ctx.fillText(formatValue(k, k.default), this.fieldRect('max').x + 10, y(4));

    // RESET VALUE, an on-screen button.
    const b = { id: 'reset', x: PAD, y: rowY(5), ...RESET };
    this.addButton(b);
    const hot = this.hoverButton === 'reset';
    ctx.beginPath();
    ctx.roundRect(b.x, b.y, b.w, b.h, 6);
    ctx.fillStyle = hot ? `${KNOB_EDIT_TINT}33` : 'transparent';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = hot ? KNOB_EDIT_TINT : `${KNOB_EDIT_TINT}88`;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = `700 ${CAPTION}px ${MONO}`;
    ctx.fillStyle = hot ? KNOB_EDIT_TINT : `${KNOB_EDIT_TINT}cc`;
    ctx.fillText('RESET VALUE', b.x + b.w / 2, b.y + b.h / 2 + 1);

    // The bottom line: errors from the store, or a hint.
    ctx.textAlign = 'left';
    ctx.font = `600 ${HINT}px ${MONO}`;
    ctx.fillStyle = this.error ? COLORS.error : COLORS.dim;
    const msg = this.error || (this.focus ? 'ENTER NEXT · ESC REVERT' : 'CLICK A FIELD TO EDIT');
    ctx.fillText(this.fit(ctx, msg, W - 2 * PAD), PAD, H - 30);
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
    ctx.lineWidth = 3;
    ctx.strokeStyle = focused ? KNOB_EDIT_TINT : draft !== undefined ? COLORS.error : hot ? `${KNOB_EDIT_TINT}88` : '#2a3330';
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x + 4, r.y, r.w - 8, r.h);
    ctx.clip();
    ctx.font = `600 ${TEXT}px ${MONO}`;
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
