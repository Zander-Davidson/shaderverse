// Curved code display. Draws the source with highlighting, line numbers,
// error markers and knob tints. With an EditorSession attached it is also the
// editor: it draws CodeMirror's selection and caret, and maps pointer input on
// the curved mesh back to document positions. Without one, clicking it opens
// the flat overlay editor. Hovering a standard library function name reports
// it for the function plot.

import { EditorSelection } from '@codemirror/state';
import * as THREE from 'three';
import { OVER_LAYER } from '../cockpit/compositor';
import { wallToWorld } from './patch';
import type { ViewUpdate } from '@codemirror/view';
import type { LayoutConfig } from '../cockpit/layout';
import { columnOf, offsetAt, TAB_SIZE } from '../editor/grid';
import { isMac, type EditorSession } from '../editor/session';
import type { ProjectStore } from '../project/store';
import { functionAt, interactiveTokens, type FunctionHit } from '../source/functions';
import { tokenize, type TokenType } from '../source/tokenizer';
import { COLORS, KNOB_TINT, MONO } from '../theme';
import { CanvasPanel, type PanelPointerEvent } from './panel';
import { PanelShape } from './shape';
import { drawScreenBackdrop, drawScreenGlare } from '../style/screen';

export const CODE_FONT_PX = 27;
export const CODE_LINE_PX = 38;
const HEADER = 70;
const GUTTER = 86;
const PAD = 18;
const TEXT_X = GUTTER + 6;
const BLINK_MS = 530;
/** Texels per wall unit; sets how large code appears on screen. */
const PX_PER_UNIT = 280;
/** Chassis bezel around the screen, in pixels. */
const BEZEL = Math.round(0.2 * PX_PER_UNIT);

interface Segment {
  text: string;
  type: TokenType;
  /** Glow color for something interactive: a knob-able number or a plottable call. */
  glow?: string;
}

const TOKEN_COLORS: Record<TokenType, string> = {
  whitespace: COLORS.ident,
  comment: COLORS.comment,
  preprocessor: COLORS.preprocessor,
  number: COLORS.number,
  identifier: COLORS.ident,
  keyword: COLORS.keyword,
  type: COLORS.type,
  builtin: COLORS.builtin,
  punct: COLORS.punct,
};

/** Expands tabs in `text`, which starts at display column `col`. */
function expandTabs(text: string, col: number): string {
  if (!text.includes('\t')) return text;
  let out = '';
  for (const ch of text) {
    if (ch === '\t') {
      const n = TAB_SIZE - ((col + out.length) % TAB_SIZE);
      out += ' '.repeat(n);
    } else out += ch;
  }
  return out;
}

export class CodePanel extends CanvasPanel {
  private lines: Segment[][] = [];
  private linesFor = '';
  private hovering = false;
  /** The library function name under the pointer, underlined. */
  private fnHover: FunctionHit | null = null;
  /** Called when the hovered function name changes. */
  onFunctionHover: ((hit: FunctionHit | null) => void) | null = null;
  private charW = 16;
  /** Horizontal scroll, in display columns (editing only). */
  private scrollCol = 0;
  private blinkOn = true;
  private lastBlink = 0;
  private drag: { anchor: number } | null = null;
  private knobChip: { x: number; y: number; w: number; h: number } | null = null;
  private radius: number;
  /**
   * The main caret is a small live mesh over the panel, so blinking doesn't
   * re-upload the (large) code texture.
   */
  readonly caret: THREE.Mesh;
  private caretPlaced = false;

  constructor(
    cfg: LayoutConfig,
    private readonly store: ProjectStore,
    /** Present when editing happens in the scene rather than in the overlay. */
    private readonly session: EditorSession | null = null,
  ) {
    // Texture density chosen in the M4 legibility pass: ~1.35 texels per
    // screen pixel at 1600×900 and DPR 2.
    const pw = Math.round(cfg.code.w * PX_PER_UNIT);
    super(cfg.code, pw, Math.round((pw * cfg.code.h) / cfg.code.w), cfg.radius, 0.01);
    this.radius = cfg.radius;
    this.reshape(cfg);
    this.caret = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: COLORS.accent, toneMapped: false, depthTest: false, transparent: true }),
    );
    this.caret.layers.set(OVER_LAYER);
    this.caret.raycast = () => {};
    this.caret.visible = false;
    store.subscribe((s, prev) => {
      if (
        s.project.source !== prev.project.source ||
        s.compile !== prev.compile ||
        s.project.knobs !== prev.project.knobs ||
        s.ui.codeScrollLine !== prev.ui.codeScrollLine ||
        s.ui.editorOpen !== prev.ui.editorOpen
      ) {
        this.invalidate();
      }
      if (s.ui.editorOpen && !prev.ui.editorOpen) this.resetBlink();
      if (s.project.source !== prev.project.source && !this.session) this.setFunctionHover(null);
    });
    session?.subscribe((u) => this.onEditorUpdate(u));
    void document.fonts?.ready.then(() => this.invalidate());
  }

  private get editing(): boolean {
    return !!this.session && this.store.getState().ui.editorOpen;
  }

  /** The text being displayed: the live editor document when in-scene. */
  private get text(): string {
    return this.session ? this.session.doc : this.store.getState().project.source;
  }

  relayout(cfg: LayoutConfig) {
    this.pixelWidth = this.canvas.width = Math.round(cfg.code.w * PX_PER_UNIT);
    this.pixelHeight = this.canvas.height = Math.round((this.pixelWidth * cfg.code.h) / cfg.code.w);
    this.rebuild(cfg.radius, cfg.code);
    this.radius = cfg.radius;
    this.reshape(cfg);
    this.invalidate();
  }

  private reshape(cfg: LayoutConfig) {
    const W = this.pixelWidth;
    const H = this.pixelHeight;
    // Clear of the portal: a plain rounded panel (the knob tubing fills the gap).
    const outer = new PanelShape(W, H, (cfg.cornerRadius / cfg.code.w) * W, null);
    this.setChassis(outer, BEZEL, cfg.radius);
  }

  /** Right edge of the text area on a screen row, clear of the portal cut. */
  private rowRight(y: number): number {
    return this.shape!.rightLimit(y + this.oy, y + this.oy + CODE_LINE_PX) - this.ox - PAD;
  }

  get visibleLines(): number {
    return Math.floor((this.ih - HEADER - PAD * 2 - this.footerHeight()) / CODE_LINE_PX);
  }

  private get visibleCols(): number {
    const top = HEADER + PAD;
    const right = this.shape!.rightLimit(top + this.oy, top + this.oy + this.visibleLines * CODE_LINE_PX) - this.ox;
    return Math.floor((right - TEXT_X - PAD - 12) / this.charW);
  }

  private footerHeight(): number {
    const errs = this.store.getState().compile.errors.length;
    const hint = this.editing && this.session!.hint.text ? 1 : 0;
    const rows = Math.min(errs, 3) + hint;
    return rows ? 26 + rows * 30 : 0;
  }

  /** Cursor blink; call every frame. */
  tick(now: number) {
    if (!this.editing) {
      this.caret.visible = false;
      return;
    }
    if (now - this.lastBlink > BLINK_MS) {
      this.lastBlink = now;
      this.blinkOn = !this.blinkOn;
    }
    const focused = this.session!.view.hasFocus;
    this.caret.visible = this.caretPlaced && (this.blinkOn || !focused);
    (this.caret.material as THREE.MeshBasicMaterial).color.set(focused ? COLORS.accent : '#3c6f86');
  }

  /** Puts the caret mesh at the main selection head on the curved surface. */
  private placeCaret(first: number, visible: number) {
    this.caretPlaced = false;
    if (!this.editing) return;
    const state = this.session!.view.state;
    const head = state.selection.main.head;
    const line = state.doc.lineAt(head);
    const row = line.number - 1 - first;
    if (row < 0 || row >= visible) return;
    const x = TEXT_X + (columnOf(line.text, head - line.from) - this.scrollCol) * this.charW;
    if (x < TEXT_X - 2 || x > this.rowRight(HEADER + PAD + row * CODE_LINE_PX)) return;
    const px = this.ox + x;
    const py = this.oy + HEADER + PAD + (row + 0.5) * CODE_LINE_PX;
    const r = this.rect;
    const wx = r.x + (px / this.pixelWidth - 0.5) * r.w;
    const wy = r.y + (0.5 - py / this.pixelHeight) * r.h;
    wallToWorld(wx, wy, this.radius, this.inset + 0.004, this.caret.position);
    this.caret.lookAt(0, 0, 0);
    this.caret.scale.set((3.5 / this.pixelWidth) * r.w, ((CODE_LINE_PX - 6) / this.pixelHeight) * r.h, 1);
    this.caretPlaced = true;
  }

  private resetBlink() {
    this.blinkOn = true;
    this.lastBlink = performance.now();
  }

  private onEditorUpdate(u: ViewUpdate | null) {
    if (u?.docChanged) this.setFunctionHover(null);
    if (u && (u.docChanged || u.selectionSet)) {
      this.resetBlink();
      // Follow the caret when it moved because of typing or keys, not scrolling.
      if (this.editing && !this.drag) this.revealHead();
    }
    this.invalidate();
  }

  /** Scrolls so the main selection head is in view. */
  private revealHead() {
    const state = this.session!.view.state;
    const head = state.selection.main.head;
    const line = state.doc.lineAt(head);
    const idx = line.number - 1;
    const visible = this.visibleLines;
    const first = this.store.getState().ui.codeScrollLine;
    let next = first;
    if (idx < first) next = idx;
    else if (idx >= first + visible) next = idx - visible + 1;
    if (next !== first) this.store.getState().dispatch({ type: 'setCodeScroll', line: next });

    const col = columnOf(line.text, head - line.from);
    const cols = this.visibleCols;
    if (col < this.scrollCol) this.scrollCol = Math.max(0, col - 8);
    else if (col > this.scrollCol + cols - 2) this.scrollCol = col - cols + 8;
  }

  private splitLines(src: string): Segment[][] {
    if (src === this.linesFor) return this.lines;
    const lines: Segment[][] = [[]];
    const interactive = interactiveTokens(src);
    for (const t of tokenize(src)) {
      const kind = interactive.get(t.start);
      const glow = kind === 'knob' ? COLORS.knobGlow : kind === 'plot' ? COLORS.plotGlow : undefined;
      const parts = t.text.split('\n');
      parts.forEach((part, i) => {
        if (i > 0) lines.push([]);
        if (part) lines[lines.length - 1]!.push({ text: part, type: t.type, glow });
      });
    }
    this.lines = lines;
    this.linesFor = src;
    return lines;
  }

  protected draw(ctx: CanvasRenderingContext2D): void {
    const { project, compile, ui, analysis } = this.store.getState();
    const W = this.iw;
    const H = this.ih;
    const text = this.text;
    const editing = this.editing;
    const lines = this.splitLines(text);
    const knobParams = new Set(project.knobs.filter((k) => k.slot >= 0).map((k) => k.param));
    const errorLines = new Map<number, string>();
    if (compile.source === text) {
      for (const e of compile.errors) if (e.line !== null && !errorLines.has(e.line)) errorLines.set(e.line, e.message);
    }
    const scrollCol = editing ? this.scrollCol : 0;

    // Frame
    const edge = editing ? '#2f6a85' : this.hovering ? '#2f4656' : COLORS.panelEdge;
    this.shape!.begin(ctx, COLORS.panel);
    // Lay out in screen coordinates; finish() restores.
    ctx.translate(this.ox, this.oy);
    drawScreenBackdrop(ctx, W, H);

    // Header
    ctx.fillStyle = editing ? '#0e1c25' : '#0d151c';
    ctx.fillRect(4, 4, W - 8, HEADER - 4);
    ctx.fillStyle = editing ? '#2f6a85' : COLORS.faint;
    ctx.fillRect(4, HEADER, W - 8, 2);
    ctx.font = `600 22px ${MONO}`;
    ctx.textBaseline = 'middle';
    // Inside the rounded corners.
    const hl = this.shape!.leftLimit(this.oy + 12, this.oy + HEADER - 12) - this.ox + 14;
    const hr = this.shape!.rightLimit(this.oy + 12, this.oy + HEADER - 12) - this.ox - 14;
    ctx.fillStyle = COLORS.accent;
    ctx.fillText('SOURCE', hl, HEADER / 2 + 2);
    ctx.fillStyle = COLORS.dim;
    ctx.fillText(`// ${project.name.toUpperCase()}`, hl + 112, HEADER / 2 + 2);
    ctx.textAlign = 'right';
    const status =
      compile.status === 'error'
        ? { t: `ERROR ×${compile.errors.length}`, c: COLORS.error }
        : compile.status === 'ok'
          ? { t: 'COMPILED', c: COLORS.ok }
          : { t: 'COMPILING', c: COLORS.warn };
    ctx.fillStyle = status.c;
    ctx.fillText(status.t, hr, HEADER / 2 + 2);
    ctx.fillStyle = editing ? COLORS.accent : this.hovering ? COLORS.text : COLORS.dim;
    const label = editing
      ? `EDITING · ${isMac() ? '⌘' : 'CTRL+'}K KNOB · ESC DONE`
      : ui.editorOpen
        ? 'EDITING'
        : 'CLICK TO EDIT';
    ctx.fillText(label, hr - 200, HEADER / 2 + 2);
    ctx.textAlign = 'left';

    // Body
    ctx.font = `${CODE_FONT_PX}px ${MONO}`;
    this.charW = ctx.measureText('M').width;
    const charW = this.charW;
    const top = HEADER + PAD;
    const visible = this.visibleLines;
    const first = Math.min(ui.codeScrollLine, Math.max(0, lines.length - 1));
    const colX = (col: number) => TEXT_X + (col - scrollCol) * charW;

    const state = editing ? this.session!.view.state : null;
    const focused = editing && this.session!.view.hasFocus;
    const headLine = state ? state.doc.lineAt(state.selection.main.head).number : -1;

    ctx.save();
    ctx.beginPath();
    ctx.rect(4, top - 4, W - 8, visible * CODE_LINE_PX + 8);
    ctx.clip();

    for (let i = 0; i < visible && first + i < lines.length; i++) {
      const n = first + i + 1;
      const y = top + i * CODE_LINE_PX;
      const mid = y + CODE_LINE_PX / 2;
      const err = errorLines.get(n);
      if (n === headLine) {
        ctx.fillStyle = '#ffffff09';
        ctx.fillRect(4, y, W - 8, CODE_LINE_PX);
      }
      if (err) {
        ctx.fillStyle = 'rgba(255, 90, 95, 0.13)';
        ctx.fillRect(4, y, W - 8, CODE_LINE_PX);
        ctx.fillStyle = COLORS.error;
        ctx.beginPath();
        ctx.arc(24, mid, 6, 0, Math.PI * 2);
        ctx.fill();
      }

      // Selection, under the text.
      if (state) {
        const line = state.doc.line(n);
        for (const r of state.selection.ranges) {
          if (r.empty || r.to < line.from || r.from > line.to) continue;
          const a = Math.max(r.from, line.from) - line.from;
          const b = Math.min(r.to, line.to) - line.from;
          const c0 = columnOf(line.text, a);
          // A selection running past the line end covers the line break too.
          const c1 = columnOf(line.text, b) + (r.to > line.to ? 0.6 : 0);
          ctx.fillStyle = focused ? '#1f4a60' : '#1a3140';
          ctx.fillRect(colX(c0), y + 2, Math.max(2, (c1 - c0) * charW), CODE_LINE_PX - 4);
        }
      }

      ctx.fillStyle = err ? COLORS.error : n === headLine ? COLORS.dim : '#3a4955';
      ctx.textAlign = 'right';
      ctx.fillText(String(n), GUTTER - 14, mid + 1);
      ctx.textAlign = 'left';

      // Text, clipped to the right of the gutter.
      ctx.save();
      ctx.beginPath();
      ctx.rect(TEXT_X - 2, y, W - TEXT_X - 8, CODE_LINE_PX);
      ctx.clip();
      let col = 0;
      let endX = colX(0);
      for (const seg of lines[first + i]!) {
        const shown = expandTabs(seg.text, col);
        const x = colX(col);
        const w = shown.length * charW;
        col += shown.length;
        endX = x + w;
        if (endX < TEXT_X) continue;
        if (x > W) break;
        const isKnob = seg.type === 'identifier' && knobParams.has(seg.text);
        if (isKnob) {
          ctx.fillStyle = `${KNOB_TINT}30`;
          ctx.fillRect(x - 2, y + 4, w + 4, CODE_LINE_PX - 8);
        }
        const glow = isKnob ? KNOB_TINT : seg.glow;
        if (seg.type === 'whitespace') continue;
        if (glow) {
          // Interactive: bright, with a glow, against the muted syntax colors.
          ctx.save();
          ctx.shadowColor = glow;
          ctx.shadowBlur = 14;
          ctx.fillStyle = glow;
          ctx.fillText(shown, x, mid + 1);
          ctx.restore();
        } else {
          ctx.fillStyle = TOKEN_COLORS[seg.type];
          ctx.fillText(shown, x, mid + 1);
        }
      }
      ctx.restore();

      if (err) {
        ctx.font = `italic ${CODE_FONT_PX - 5}px ${MONO}`;
        const msg = `◀ ${err}`;
        const mw = ctx.measureText(msg).width;
        const right = this.rowRight(y);
        const mx = Math.max(Math.max(endX, TEXT_X) + 24, right - mw);
        ctx.fillStyle = 'rgba(10, 15, 20, 0.85)';
        ctx.fillRect(mx - 8, y + 3, right - mx + 8, CODE_LINE_PX - 6);
        ctx.fillStyle = COLORS.error;
        ctx.fillText(msg, mx, mid + 1);
        ctx.font = `${CODE_FONT_PX}px ${MONO}`;
      }
    }

    // Carets, over the text.
    if (state) {
      for (const r of state.selection.ranges) {
        if (r === state.selection.main) continue; // the caret mesh
        const line = state.doc.lineAt(r.head);
        const i = line.number - 1 - first;
        if (i < 0 || i >= visible) continue;
        const x = colX(columnOf(line.text, r.head - line.from));
        if (x < TEXT_X - 2) continue;
        ctx.fillStyle = focused ? COLORS.accent : '#3c6f86';
        ctx.fillRect(x - 1.5, top + i * CODE_LINE_PX + 3, 3.5, CODE_LINE_PX - 6);
      }
    }
    if (this.fnHover) {
      const { from, to } = this.fnHover;
      const start = text.lastIndexOf('\n', from - 1) + 1;
      const end = text.indexOf('\n', from);
      const lineText = text.slice(start, end === -1 ? undefined : end);
      const i = text.slice(0, from).split('\n').length - 1 - first;
      if (i >= 0 && i < visible) {
        const x0 = colX(columnOf(lineText, from - start));
        ctx.fillStyle = COLORS.plotGlow;
        ctx.fillRect(x0, top + (i + 1) * CODE_LINE_PX - 5, colX(columnOf(lineText, to - start)) - x0, 3);
      }
    }
    ctx.restore();

    // "Make knob" chip by the selection end.
    this.knobChip = null;
    const offer = editing ? this.session!.knobOffer() : null;
    if (offer && state) {
      const end = state.selection.main.to;
      const line = state.doc.lineAt(end);
      const i = line.number - 1 - first;
      if (i >= 0 && i < visible) {
        ctx.font = `600 ${CODE_FONT_PX - 6}px ${MONO}`;
        const label = offer.ok ? `◉ make knob “${offer.name}”` : `✕ ${offer.reason}`;
        const h = CODE_LINE_PX - 4;
        // Sit on the line below the selection, or above it at the bottom edge.
        const row = i + 1 < visible ? i + 1 : i - 1;
        const y = top + row * CODE_LINE_PX + 2;
        const right = this.rowRight(y);
        const w = Math.min(ctx.measureText(label).width + 24, right - TEXT_X);
        let x = colX(columnOf(line.text, end - line.from)) + 14;
        if (x + w > right) x = Math.max(TEXT_X, right - w);
        ctx.fillStyle = offer.ok ? '#0b2430' : '#1d1012';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = offer.ok ? COLORS.accent : '#5a3a3c';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
        ctx.fillStyle = offer.ok ? COLORS.accent : '#ff8a8e';
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w - 10, h);
        ctx.clip();
        ctx.fillText(label, x + 12, y + h / 2 + 1);
        ctx.restore();
        if (offer.ok) this.knobChip = { x, y, w, h };
      }
    }

    // Scroll indicator
    if (lines.length > visible) {
      const trackH = visible * CODE_LINE_PX;
      const h = Math.max(30, (trackH * visible) / lines.length);
      const y = top + ((trackH - h) * first) / Math.max(1, lines.length - visible);
      // On the left edge: the right edge is the curved cut.
      ctx.fillStyle = '#1d2a35';
      ctx.fillRect(8, top, 4, trackH);
      ctx.fillStyle = '#3c5262';
      ctx.fillRect(8, Math.min(y, top + trackH - h), 4, h);
    }
    if (editing && scrollCol > 0) {
      ctx.fillStyle = '#3c5262';
      ctx.fillRect(TEXT_X - 4, top, 3, visible * CODE_LINE_PX);
    }

    // Footer: editor hint, compile errors, then analysis notes.
    const errs = compile.source === text ? compile.errors : [];
    const hint = editing ? this.session!.hint : null;
    if (errs.length || hint?.text) {
      const fy = H - this.footerHeight() - PAD / 2;
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(4, fy, W - 8, 2);
      ctx.font = `${CODE_FONT_PX - 4}px ${MONO}`;
      let row = 0;
      const put = (t: string, color: string) => {
        ctx.fillStyle = color;
        ctx.fillText(t.length > 90 ? `${t.slice(0, 89)}…` : t, PAD + 8, fy + 28 + row++ * 30);
      };
      if (hint?.text) put(hint.text, hint.kind === 'error' ? COLORS.error : hint.kind === 'ok' ? COLORS.ok : COLORS.dim);
      for (const e of errs.slice(0, 3)) put(`${e.line !== null ? `line ${e.line}: ` : ''}${e.message}`, COLORS.error);
    } else if (!analysis.ok) {
      ctx.font = `${CODE_FONT_PX - 5}px ${MONO}`;
      ctx.fillStyle = COLORS.warn;
      ctx.fillText(`knobs unavailable: ${analysis.reason}`, PAD + 8, H - PAD - 6);
    }
    this.placeCaret(first, visible);
    drawScreenGlare(ctx, W, H);
    this.shape!.finish(ctx, edge, editing ? '#3ff2c466' : '#3ff2c422');
  }

  /** Panel pixel at the middle of the character cell starting at `pos`. */
  pixelOf(pos: number): { x: number; y: number } {
    const doc = this.session ? this.session.view.state.doc : null;
    const text = this.text;
    const before = text.slice(0, pos);
    const lineIdx = doc ? doc.lineAt(pos).number - 1 : before.split('\n').length - 1;
    const lineText = text.split('\n')[lineIdx] ?? '';
    const ch = pos - (before.lastIndexOf('\n') + 1);
    const row = lineIdx - this.store.getState().ui.codeScrollLine;
    const scrollCol = this.editing ? this.scrollCol : 0;
    return {
      x: this.ox + TEXT_X + (columnOf(lineText, ch) - scrollCol + 0.5) * this.charW,
      y: this.oy + HEADER + PAD + (row + 0.5) * CODE_LINE_PX,
    };
  }

  /** Document position under panel pixel (x, y), clamped to the text. */
  private posAt(px: number, py: number): number {
    const x = px - this.ox;
    const y = py - this.oy;
    const doc = this.session!.view.state.doc;
    const first = this.store.getState().ui.codeScrollLine;
    const row = Math.floor((y - HEADER - PAD) / CODE_LINE_PX);
    const n = Math.min(doc.lines, Math.max(1, first + row + 1));
    const line = doc.line(n);
    const col = (x - TEXT_X) / this.charW + this.scrollCol;
    return line.from + offsetAt(line.text, col);
  }

  private scrollBy(lines: number, cols = 0) {
    const { ui } = this.store.getState();
    const count = this.splitLines(this.text).length;
    const max = Math.max(0, count - this.visibleLines + 2);
    const next = Math.min(max, Math.max(0, ui.codeScrollLine + lines));
    if (next !== ui.codeScrollLine) this.store.getState().dispatch({ type: 'setCodeScroll', line: next });
    if (cols && this.editing) {
      this.scrollCol = Math.max(0, this.scrollCol + cols);
      this.invalidate();
    }
  }

  /** Source offset of the character drawn at panel pixel (x, y), if any. */
  private charAt(px: number, py: number): number | null {
    const row = Math.floor((py - this.oy - HEADER - PAD) / CODE_LINE_PX);
    if (row < 0 || row >= this.visibleLines || px - this.ox < TEXT_X) return null;
    const lines = this.text.split('\n');
    const n = this.store.getState().ui.codeScrollLine + row;
    const line = lines[n];
    if (line === undefined) return null;
    const scrollCol = this.editing ? this.scrollCol : 0;
    // The cell containing the column, not the nearest boundary.
    const ch = offsetAt(line, (px - this.ox - TEXT_X) / this.charW + scrollCol - 0.5);
    if (ch >= line.length) return null;
    return lines.slice(0, n).reduce((at, l) => at + l.length + 1, 0) + ch;
  }

  private setFunctionHover(hit: FunctionHit | null) {
    if (hit?.from === this.fnHover?.from && hit?.fn === this.fnHover?.fn) return;
    this.fnHover = hit;
    this.invalidate();
    this.onFunctionHover?.(hit);
  }

  onPointer(e: PanelPointerEvent): boolean | void {
    if (e.kind === 'hover' || e.kind === 'leave') {
      const h = e.kind === 'hover';
      if (h !== this.hovering) {
        this.hovering = h;
        this.invalidate();
      }
      const pos = h ? this.charAt(e.x, e.y) : null;
      this.setFunctionHover(pos === null ? null : functionAt(this.text, pos));
      return;
    }
    if (e.kind === 'wheel') {
      const step = (d: number) => Math.sign(d) * Math.max(1, Math.round(Math.abs(d) / 40));
      if (e.shiftKey) this.scrollBy(0, step(e.deltaY) * 4);
      else this.scrollBy(step(e.deltaY));
      return true;
    }
    if (!this.session) {
      if (e.kind === 'up' && e.button === 0) this.store.getState().dispatch({ type: 'openEditor' });
      return;
    }
    return this.onEditPointer(e);
  }

  private onEditPointer(e: PanelPointerEvent): boolean | void {
    const view = this.session!.view;
    if (e.kind === 'down' && e.button === 0) {
      const c = this.knobChip;
      const cx = e.x - this.ox;
      const cy = e.y - this.oy;
      if (this.editing && c && cx >= c.x && cx <= c.x + c.w && cy >= c.y && cy <= c.y + c.h) {
        this.session!.createKnob();
        this.refocus();
        return;
      }
      if (!this.store.getState().ui.editorOpen) this.store.getState().dispatch({ type: 'openEditor' });
      const pos = this.posAt(e.x, e.y);
      const sel = view.state.selection.main;
      const anchor = e.shiftKey ? sel.anchor : pos;
      if (e.altKey || e.metaKey) {
        // Add a cursor, like CodeMirror's own Alt/Cmd-click.
        view.dispatch({ selection: view.state.selection.addRange(EditorSelection.cursor(pos)) });
      } else {
        view.dispatch({ selection: EditorSelection.single(anchor, pos), userEvent: 'select.pointer' });
      }
      this.drag = { anchor };
      this.refocus();
      return true;
    }
    if (e.kind === 'move' && this.drag && Number.isFinite(e.y)) {
      // Dragging past the top or bottom edge scrolls.
      const bottom = this.oy + HEADER + PAD + this.visibleLines * CODE_LINE_PX;
      if (e.y < this.oy + HEADER + PAD) this.scrollBy(-1);
      else if (e.y > bottom) this.scrollBy(1);
      const head = this.posAt(e.x, e.y);
      view.dispatch({ selection: EditorSelection.single(this.drag.anchor, head), userEvent: 'select.pointer' });
      return;
    }
    if (e.kind === 'up' && this.drag) {
      this.drag = null;
      this.refocus();
      return;
    }
    if (e.kind === 'dblclick' && this.editing) {
      const pos = this.posAt(e.x, e.y);
      // Whole numeric literals (".5", "1e-3") select as one word: they're
      // what knobs are made from.
      const num = tokenize(view.state.doc.toString()).find((t) => t.type === 'number' && t.start <= pos && pos <= t.end);
      const word = num ? { from: num.start, to: num.end } : view.state.wordAt(pos);
      if (word) view.dispatch({ selection: EditorSelection.single(word.from, word.to), userEvent: 'select.pointer' });
      this.refocus();
    }
  }

  /** Pointer events land on the canvas, which takes focus; give it back. */
  private refocus() {
    const view = this.session!.view;
    view.focus();
    setTimeout(() => {
      if (this.store.getState().ui.editorOpen) view.focus();
    }, 0);
  }

  cursorAt(): string {
    return 'text';
  }
}
