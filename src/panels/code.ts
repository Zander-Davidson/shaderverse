// Curved, read-only code display. Draws the source with highlighting, line
// numbers, error markers and knob tints; clicking it opens the editor overlay.

import type { LayoutConfig } from '../cockpit/layout';
import type { ProjectStore } from '../project/store';
import { tokenize, type TokenType } from '../source/tokenizer';
import { COLORS, KNOB_TINTS, MONO } from '../theme';
import { CanvasPanel, type PanelPointerEvent } from './panel';

export const CODE_FONT_PX = 27;
export const CODE_LINE_PX = 38;
const HEADER = 70;
const GUTTER = 86;
const PAD = 18;

interface Segment {
  text: string;
  type: TokenType;
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

export class CodePanel extends CanvasPanel {
  private lines: Segment[][] = [];
  private linesFor = '';
  private hovering = false;

  constructor(
    cfg: LayoutConfig,
    private readonly store: ProjectStore,
  ) {
    // Texture resolution chosen in the M4 legibility pass: ~1.35 texels per
    // screen pixel at 1600×900 and DPR 2.
    const pw = 1536;
    super(cfg.code, pw, Math.round((pw * cfg.code.h) / cfg.code.w), cfg.radius, 0.01);
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
    });
    void document.fonts?.ready.then(() => this.invalidate());
  }

  relayout(cfg: LayoutConfig) {
    this.pixelHeight = Math.round((this.pixelWidth * cfg.code.h) / cfg.code.w);
    this.canvas.height = this.pixelHeight;
    this.rebuild(cfg.radius, cfg.code);
    this.invalidate();
  }

  get visibleLines(): number {
    return Math.floor((this.pixelHeight - HEADER - PAD * 2 - this.footerHeight()) / CODE_LINE_PX);
  }

  private footerHeight(): number {
    const errs = this.store.getState().compile.errors;
    return errs.length ? 26 + Math.min(errs.length, 3) * 30 : 0;
  }

  private splitLines(src: string): Segment[][] {
    if (src === this.linesFor) return this.lines;
    const lines: Segment[][] = [[]];
    for (const t of tokenize(src)) {
      const parts = t.text.split('\n');
      parts.forEach((part, i) => {
        if (i > 0) lines.push([]);
        if (part) lines[lines.length - 1]!.push({ text: part.replace(/\t/g, '    '), type: t.type });
      });
    }
    this.lines = lines;
    this.linesFor = src;
    return lines;
  }

  protected draw(ctx: CanvasRenderingContext2D): void {
    const { project, compile, ui, analysis } = this.store.getState();
    const W = this.pixelWidth;
    const H = this.pixelHeight;
    const lines = this.splitLines(project.source);
    const tints = new Map(project.knobs.filter((k) => k.slot >= 0).map((k) => [k.param, KNOB_TINTS[k.slot % KNOB_TINTS.length]!]));
    const errorLines = new Map<number, string>();
    if (compile.source === project.source) {
      for (const e of compile.errors) if (e.line !== null && !errorLines.has(e.line)) errorLines.set(e.line, e.message);
    }

    // Frame
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = this.hovering ? '#2f4656' : COLORS.panelEdge;
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, W - 4, H - 4);

    // Header
    ctx.fillStyle = '#0d151c';
    ctx.fillRect(4, 4, W - 8, HEADER - 4);
    ctx.fillStyle = COLORS.faint;
    ctx.fillRect(4, HEADER, W - 8, 2);
    ctx.font = `600 22px ${MONO}`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLORS.accent;
    ctx.fillText('SOURCE', PAD + 8, HEADER / 2 + 2);
    ctx.fillStyle = COLORS.dim;
    ctx.fillText(`// ${project.name.toUpperCase()}`, PAD + 120, HEADER / 2 + 2);
    ctx.textAlign = 'right';
    const status =
      compile.status === 'error'
        ? { t: `ERROR ×${compile.errors.length}`, c: COLORS.error }
        : compile.status === 'ok'
          ? { t: 'COMPILED', c: COLORS.ok }
          : { t: 'COMPILING', c: COLORS.warn };
    ctx.fillStyle = status.c;
    ctx.fillText(status.t, W - PAD - 8, HEADER / 2 + 2);
    ctx.fillStyle = this.hovering ? COLORS.text : COLORS.dim;
    ctx.fillText(ui.editorOpen ? 'EDITING' : 'CLICK TO EDIT', W - PAD - 220, HEADER / 2 + 2);
    ctx.textAlign = 'left';

    // Body
    ctx.font = `${CODE_FONT_PX}px ${MONO}`;
    const charW = ctx.measureText('M').width;
    const top = HEADER + PAD;
    const visible = this.visibleLines;
    const first = Math.min(ui.codeScrollLine, Math.max(0, lines.length - 1));
    ctx.save();
    ctx.beginPath();
    ctx.rect(4, top - 4, W - 8, visible * CODE_LINE_PX + 8);
    ctx.clip();
    for (let i = 0; i < visible && first + i < lines.length; i++) {
      const n = first + i + 1;
      const y = top + i * CODE_LINE_PX;
      const mid = y + CODE_LINE_PX / 2;
      const err = errorLines.get(n);
      if (err) {
        ctx.fillStyle = 'rgba(255, 90, 95, 0.13)';
        ctx.fillRect(4, y, W - 8, CODE_LINE_PX);
        ctx.fillStyle = COLORS.error;
        ctx.beginPath();
        ctx.arc(16, mid, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = err ? COLORS.error : '#3a4955';
      ctx.textAlign = 'right';
      ctx.fillText(String(n), GUTTER - 14, mid + 1);
      ctx.textAlign = 'left';

      let x = GUTTER + 6;
      for (const seg of lines[first + i]!) {
        const tint = seg.type === 'identifier' ? tints.get(seg.text) : undefined;
        const w = seg.text.length * charW;
        if (tint) {
          ctx.fillStyle = `${tint}30`;
          ctx.fillRect(x - 2, y + 4, w + 4, CODE_LINE_PX - 8);
          ctx.fillStyle = tint;
        } else {
          ctx.fillStyle = TOKEN_COLORS[seg.type];
        }
        if (seg.type !== 'whitespace') ctx.fillText(seg.text, x, mid + 1);
        x += w;
        if (x > W) break;
      }
      if (err) {
        ctx.font = `italic ${CODE_FONT_PX - 5}px ${MONO}`;
        const msg = `◀ ${err}`;
        const mw = ctx.measureText(msg).width;
        const mx = Math.max(x + 24, W - PAD - mw);
        ctx.fillStyle = 'rgba(10, 15, 20, 0.85)';
        ctx.fillRect(mx - 8, y + 3, W - mx, CODE_LINE_PX - 6);
        ctx.fillStyle = COLORS.error;
        ctx.fillText(msg, mx, mid + 1);
        ctx.font = `${CODE_FONT_PX}px ${MONO}`;
      }
    }
    ctx.restore();

    // Scroll indicator
    if (lines.length > visible) {
      const trackH = visible * CODE_LINE_PX;
      const h = Math.max(30, (trackH * visible) / lines.length);
      const y = top + ((trackH - h) * first) / Math.max(1, lines.length - visible);
      ctx.fillStyle = '#1d2a35';
      ctx.fillRect(W - 12, top, 4, trackH);
      ctx.fillStyle = '#3c5262';
      ctx.fillRect(W - 12, Math.min(y, top + trackH - h), 4, h);
    }

    // Footer: compile errors, then analysis notes.
    const errs = compile.source === project.source ? compile.errors : [];
    if (errs.length) {
      const fy = H - this.footerHeight() - PAD / 2;
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(4, fy, W - 8, 2);
      ctx.font = `${CODE_FONT_PX - 4}px ${MONO}`;
      errs.slice(0, 3).forEach((e, i) => {
        ctx.fillStyle = COLORS.error;
        const text = `${e.line !== null ? `line ${e.line}: ` : ''}${e.message}`;
        ctx.fillText(text.length > 90 ? `${text.slice(0, 89)}…` : text, PAD + 8, fy + 28 + i * 30);
      });
    } else if (!analysis.ok) {
      ctx.font = `${CODE_FONT_PX - 5}px ${MONO}`;
      ctx.fillStyle = COLORS.warn;
      ctx.fillText(`knobs unavailable: ${analysis.reason}`, PAD + 8, H - PAD - 6);
    }
  }

  onPointer(e: PanelPointerEvent): boolean | void {
    if (e.kind === 'hover' || e.kind === 'leave') {
      const h = e.kind === 'hover';
      if (h !== this.hovering) {
        this.hovering = h;
        this.invalidate();
      }
      return;
    }
    if (e.kind === 'wheel') {
      const { ui, project } = this.store.getState();
      const lines = this.splitLines(project.source).length;
      const max = Math.max(0, lines - this.visibleLines + 2);
      const step = Math.sign(e.deltaY) * Math.max(1, Math.round(Math.abs(e.deltaY) / 40));
      const next = Math.min(max, Math.max(0, ui.codeScrollLine + step));
      if (next !== ui.codeScrollLine) this.store.getState().dispatch({ type: 'setCodeScroll', line: next });
      return true;
    }
    if (e.kind === 'up' && e.button === 0) {
      this.store.getState().dispatch({ type: 'openEditor' });
    }
  }

  cursorAt(): string {
    return 'text';
  }
}
