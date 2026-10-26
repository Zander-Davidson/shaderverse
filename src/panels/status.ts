// Status readout (compile state, frame rate, time, playback, quality) and the
// library panel (examples, import and export, shortcuts).

import type { LayoutConfig, Rect } from '../cockpit/layout';
import type { ProjectStore } from '../project/store';
import type { Quality, ShaderRuntime } from '../shader/runtime';
import { COLORS, MONO } from '../theme';
import { CanvasPanel } from './panel';
import { cutCircleFor, PanelShape } from './shape';
import { drawScreenBackdrop, drawScreenGlare, gelButton, PHOSPHOR } from '../style/screen';

const PX_PER_UNIT = 256;
const HEAD = 56;
const BEZEL = Math.round(0.2 * PX_PER_UNIT);

/**
 * Base for the right-hand panels. Their inner edge is carved by the portal's
 * clearance circle, so each row starts just right of the curve.
 */
abstract class ReadoutPanel extends CanvasPanel {
  constructor(
    rect: Rect,
    protected cfg: LayoutConfig,
  ) {
    super(rect, Math.round(rect.w * PX_PER_UNIT), Math.round(rect.h * PX_PER_UNIT), cfg.radius, 0.01);
    this.reshape();
  }

  protected relayoutTo(cfg: LayoutConfig, rect: Rect) {
    this.cfg = cfg;
    this.pixelWidth = this.canvas.width = Math.round(rect.w * PX_PER_UNIT);
    this.pixelHeight = this.canvas.height = Math.round(rect.h * PX_PER_UNIT);
    this.rebuild(cfg.radius, rect);
    this.reshape();
    this.invalidate();
  }

  private reshape() {
    const W = this.pixelWidth;
    const H = this.pixelHeight;
    const outer = new PanelShape(W, H, (this.cfg.cornerRadius / this.rect.w) * W, cutCircleFor(this.cfg, this.rect, W, H));
    this.setBezel(outer, BEZEL);
  }

  /** Left edge for content spanning screen rows y0..y1, clear of the curve. */
  protected left(y0: number, y1: number): number {
    return Math.max(16, this.shape!.leftLimit(y0 + this.oy, y1 + this.oy) - this.ox + 18);
  }

  /** Right edge for content spanning screen rows y0..y1. */
  protected rightAt(y0: number, y1: number): number {
    return this.shape!.rightLimit(y0 + this.oy, y1 + this.oy) - this.ox - 18;
  }

  protected get right(): number {
    return this.rightAt(HEAD, this.ih - HEAD);
  }

  protected frame(ctx: CanvasRenderingContext2D, title: string, tag: string) {
    this.shape!.begin(ctx, COLORS.panel);
    // Lay out in screen coordinates; end() restores.
    ctx.translate(this.ox, this.oy);
    drawScreenBackdrop(ctx, this.iw, this.ih);
    const hg = ctx.createLinearGradient(0, 0, 0, HEAD);
    hg.addColorStop(0, 'rgba(63, 242, 196, 0.16)');
    hg.addColorStop(1, 'rgba(63, 242, 196, 0.04)');
    ctx.fillStyle = hg;
    ctx.fillRect(0, 0, this.iw, HEAD);
    ctx.fillStyle = 'rgba(63, 242, 196, 0.35)';
    ctx.fillRect(0, HEAD, this.iw, 2);
    ctx.font = `700 24px ${MONO}`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = PHOSPHOR;
    ctx.fillText(title, this.left(10, HEAD - 10) + 8, 30);
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.dim;
    ctx.fillText(tag, this.rightAt(10, HEAD - 10) - 8, 30);
    ctx.textAlign = 'left';
  }

  protected end(ctx: CanvasRenderingContext2D) {
    drawScreenGlare(ctx, this.iw, this.ih);
    this.shape!.finish(ctx, '#0a1413', '#3ff2c422');
  }

  protected label(ctx: CanvasRenderingContext2D, text: string, y: number) {
    ctx.font = `600 18px ${MONO}`;
    ctx.fillStyle = COLORS.dim;
    ctx.fillText(text, this.left(y - 10, y + 10), y);
  }

  /** A label on the left and a value on the right of one row. */
  protected row(ctx: CanvasRenderingContext2D, label: string, value: string, y: number) {
    this.label(ctx, label, y);
    ctx.font = `500 34px ${MONO}`;
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = 'right';
    ctx.fillText(value, this.right, y);
    ctx.textAlign = 'left';
  }

  /** Buttons laid side by side across a row, from the curve to the right edge. */
  protected buttonRow(ctx: CanvasRenderingContext2D, y: number, h: number, items: { id: string; text: string; active?: boolean }[], align: CanvasTextAlign = 'center') {
    const x0 = this.left(y, y + h);
    const gap = 12;
    const w = (this.right - x0 - gap * (items.length - 1)) / items.length;
    items.forEach((it, i) => this.button(ctx, it.id, it.text, x0 + i * (w + gap), y, w, h, it.active, align));
  }

  protected button(
    ctx: CanvasRenderingContext2D,
    id: string,
    text: string,
    x: number,
    y: number,
    w: number,
    h: number,
    active = false,
    align: CanvasTextAlign = 'center',
  ) {
    const hover = this.hoverButton === id;
    gelButton(ctx, x, y, w, h, { active, hover });
    ctx.fillStyle = active ? '#eafff8' : hover ? '#e2eef0' : '#a9c2c6';
    ctx.font = `700 ${h < 50 ? 19 : 22}px ${MONO}`;
    ctx.textAlign = align;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.fillText(text, align === 'center' ? x + w / 2 : x + 16, y + h / 2 + 1);
    ctx.restore();
    ctx.textAlign = 'left';
    this.addButton({ id, x, y, w, h });
  }
}

export class StatusPanel extends ReadoutPanel {
  fps = 0;
  private lastDraw = 0;

  constructor(
    cfg: LayoutConfig,
    private readonly store: ProjectStore,
    private readonly runtime: ShaderRuntime,
  ) {
    super(cfg.status, cfg);
    store.subscribe((s, p) => {
      if (s.compile !== p.compile || s.project.playback !== p.project.playback) this.invalidate();
    });
  }

  relayout(cfg: LayoutConfig) {
    this.relayoutTo(cfg, cfg.status);
  }

  /** Readouts change every frame; redraw four times a second. */
  tick(now: number) {
    if (now - this.lastDraw > 250) {
      this.lastDraw = now;
      this.invalidate();
    }
  }

  protected draw(ctx: CanvasRenderingContext2D): void {
    const { compile, project } = this.store.getState();
    this.frame(ctx, 'STATUS', 'UNIT C/7a');

    this.label(ctx, 'COMPILE', 88);
    const st =
      compile.status === 'ok'
        ? { t: 'NOMINAL', c: COLORS.ok }
        : compile.status === 'error'
          ? { t: `FAULT ×${compile.errors.length}`, c: COLORS.error }
          : { t: 'PENDING', c: COLORS.warn };
    // Status LED
    ctx.save();
    ctx.shadowColor = st.c;
    ctx.shadowBlur = 16;
    ctx.fillStyle = st.c;
    ctx.beginPath();
    ctx.arc(this.right - 8, 88, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = st.c;
    ctx.font = `600 36px ${MONO}`;
    ctx.fillText(st.t, this.left(110, 140), 124);

    this.row(ctx, 'FPS', this.fps.toFixed(0), 178);
    this.row(ctx, 'TIME', `${this.runtime.time.toFixed(2)}s`, 222);
    this.row(ctx, 'FRAME', String(this.runtime.frame), 266);
    this.row(ctx, 'RES', `${this.runtime.size}²`, 310);

    ctx.fillStyle = 'rgba(63, 242, 196, 0.25)';
    const lx = this.left(339, 342);
    ctx.fillRect(lx, 340, this.right - lx, 2);
    this.label(ctx, 'PLAYBACK', 370);
    this.buttonRow(ctx, 390, 64, [
      { id: 'play', text: project.playback.playing ? '❚❚ PAUSE' : '▶ PLAY', active: !project.playback.playing },
      { id: 'restart', text: '⟲ RESTART' },
    ]);

    this.label(ctx, 'QUALITY', 492);
    this.buttonRow(
      ctx,
      512,
      64,
      (['low', 'medium', 'high'] as Quality[]).map((q) => ({
        id: `q:${q}`,
        text: q === 'medium' ? 'MED' : q.toUpperCase(),
        active: project.playback.quality === q,
      })),
    );

    ctx.font = `18px ${MONO}`;
    ctx.fillStyle = COLORS.dim;
    if (compile.status === 'error') ctx.fillText('LAST GOOD PROGRAM RUNNING', this.left(610, 630), 620);
    const fy = this.ih - 34;
    ctx.fillText('SPACE pause · R restart · Q quality', this.left(fy - 10, fy + 10), fy);
    this.end(ctx);
  }

  protected onButton(id: string): void {
    const s = this.store.getState();
    if (id === 'play') s.dispatch({ type: 'setPlayback', playing: !s.project.playback.playing });
    else if (id === 'restart') s.dispatch({ type: 'restart' });
    else if (id.startsWith('q:')) s.dispatch({ type: 'setPlayback', quality: id.slice(2) as Quality });
  }
}

export interface LibraryActions {
  examples: string[];
  loadExample(index: number): void;
  exportProject(): void;
  importProject(): void;
  exportGlsl(): void;
  toggleHelp(): void;
}

export class LibraryPanel extends ReadoutPanel {
  constructor(
    cfg: LayoutConfig,
    private readonly store: ProjectStore,
    private readonly actions: LibraryActions,
  ) {
    super(cfg.library, cfg);
    store.subscribe((s, p) => {
      if (s.project.name !== p.project.name) this.invalidate();
    });
  }

  relayout(cfg: LayoutConfig) {
    this.relayoutTo(cfg, cfg.library);
  }

  protected draw(ctx: CanvasRenderingContext2D): void {
    const current = this.store.getState().project.name;
    this.frame(ctx, 'LIBRARY', 'v1.0');
    this.label(ctx, 'NEW FROM EXAMPLE', 80);
    const step = 47;
    this.actions.examples.forEach((name, i) => {
      const y = 96 + i * step;
      this.buttonRow(ctx, y, step - 8, [{ id: `ex:${i}`, text: `${String(i + 1).padStart(2, '0')}  ${name.toUpperCase()}`, active: name === current }], 'left');
    });
    const y0 = 96 + this.actions.examples.length * step + 12;
    ctx.fillStyle = 'rgba(63, 242, 196, 0.25)';
    const lx = this.left(y0 - 1, y0 + 2);
    ctx.fillRect(lx, y0, this.right - lx, 2);
    this.label(ctx, 'FILE', y0 + 24);
    this.buttonRow(ctx, y0 + 40, 40, [
      { id: 'export', text: '↓ PROJECT' },
      { id: 'import', text: '↑ PROJECT' },
    ]);
    this.buttonRow(ctx, y0 + 88, 40, [
      { id: 'glsl', text: '↓ .GLSL' },
      { id: 'help', text: '? KEYS' },
    ]);
    this.end(ctx);
  }

  protected onButton(id: string): void {
    if (id.startsWith('ex:')) this.actions.loadExample(Number(id.slice(3)));
    else if (id === 'export') this.actions.exportProject();
    else if (id === 'import') this.actions.importProject();
    else if (id === 'glsl') this.actions.exportGlsl();
    else if (id === 'help') this.actions.toggleHelp();
  }
}
