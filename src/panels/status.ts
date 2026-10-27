// Status readout (compile state, frame rate, time, resolution) and the library
// panel (examples, import and export, shortcuts). Playback and quality are
// keyboard shortcuts until the hanging console's buttons take them.

import type { LayoutConfig, MonitorLayout } from '../cockpit/layout';
import type { ProjectStore } from '../project/store';
import type { ShaderRuntime } from '../shader/runtime';
import { COLORS, MONO } from '../theme';
import { MonitorPanel } from './monitor';
import { PanelShape } from './shape';
import { drawScreenBackdrop, drawScreenGlare, gelButton, PHOSPHOR } from '../style/screen';

const PX_PER_UNIT = 256;
const HEAD = 56;
const BEZEL = Math.round(0.2 * PX_PER_UNIT);

/**
 * Base for the right-hand monitors. Content is laid out in "view" pixels,
 * `zoom` texels each, so the readouts stay legible on monitors that are small
 * on screen; the texture keeps its full resolution.
 */
abstract class ReadoutPanel extends MonitorPanel {
  constructor(
    m: MonitorLayout,
    protected cfg: LayoutConfig,
    protected readonly zoom: number,
  ) {
    super(m, Math.round(m.w * PX_PER_UNIT), Math.round(m.h * PX_PER_UNIT));
    this.reshape();
    this.hang(cfg, m);
  }

  protected relayoutTo(cfg: LayoutConfig, m: MonitorLayout) {
    this.cfg = cfg;
    this.pixelWidth = this.canvas.width = Math.round(m.w * PX_PER_UNIT);
    this.pixelHeight = this.canvas.height = Math.round(m.h * PX_PER_UNIT);
    this.rect = { x: 0, y: 0, w: m.w, h: m.h };
    this.reshape();
    this.hang(cfg, m);
    this.invalidate();
  }

  private reshape() {
    const W = this.pixelWidth;
    const H = this.pixelHeight;
    const outer = new PanelShape(W, H, (this.cfg.cornerRadius / this.rect.w) * W, null);
    this.setBezel(outer, BEZEL);
  }

  /** Width and height of the screen in view pixels. */
  protected get vw(): number {
    return this.iw / this.zoom;
  }

  protected get vh(): number {
    return this.ih / this.zoom;
  }

  /** Left edge for content spanning view rows y0..y1, inside the corners. */
  protected left(y0: number, y1: number): number {
    const z = this.zoom;
    return Math.max(12, (this.shape!.leftLimit(y0 * z + this.oy, y1 * z + this.oy) - this.ox) / z + 14);
  }

  /** Right edge for content spanning view rows y0..y1. */
  protected rightAt(y0: number, y1: number): number {
    const z = this.zoom;
    return (this.shape!.rightLimit(y0 * z + this.oy, y1 * z + this.oy) - this.ox) / z - 14;
  }

  protected get right(): number {
    return this.rightAt(HEAD, this.vh - HEAD);
  }

  protected override addButton(b: { id: string; x: number; y: number; w: number; h: number }): void {
    const z = this.zoom;
    super.addButton({ id: b.id, x: b.x * z, y: b.y * z, w: b.w * z, h: b.h * z });
  }

  protected frame(ctx: CanvasRenderingContext2D, title: string, tag: string) {
    this.shape!.begin(ctx, COLORS.panel);
    // Lay out in screen coordinates; end() restores.
    ctx.translate(this.ox, this.oy);
    ctx.scale(this.zoom, this.zoom);
    drawScreenBackdrop(ctx, this.vw, this.vh);
    const hg = ctx.createLinearGradient(0, 0, 0, HEAD);
    hg.addColorStop(0, 'rgba(63, 242, 196, 0.16)');
    hg.addColorStop(1, 'rgba(63, 242, 196, 0.04)');
    ctx.fillStyle = hg;
    ctx.fillRect(0, 0, this.vw, HEAD);
    ctx.fillStyle = 'rgba(63, 242, 196, 0.35)';
    ctx.fillRect(0, HEAD, this.vw, 2);
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
    drawScreenGlare(ctx, this.vw, this.vh);
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

  /** Buttons laid side by side across a row, from x0 (default: the left edge) to x1 (the right edge). */
  protected buttonRow(
    ctx: CanvasRenderingContext2D,
    y: number,
    h: number,
    items: { id: string; text: string; active?: boolean }[],
    align: CanvasTextAlign = 'center',
    x0 = this.left(y, y + h),
    x1 = this.right,
  ) {
    const gap = 10;
    const w = (x1 - x0 - gap * (items.length - 1)) / items.length;
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
    super(cfg.status, cfg, 1.75);
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

    this.row(ctx, 'FPS', this.fps.toFixed(0), 186);
    this.row(ctx, 'TIME', `${this.runtime.time.toFixed(2)}s`, 234);
    this.row(ctx, 'FRAME', String(this.runtime.frame), 282);
    this.row(ctx, 'RES', `${this.runtime.size}²`, 330);

    ctx.font = `600 16px ${MONO}`;
    ctx.fillStyle = COLORS.dim;
    const state = `${project.playback.playing ? 'PLAYING' : 'PAUSED'} · ${project.playback.quality.toUpperCase()}`;
    ctx.fillText(state, this.left(366, 386), 376);
    if (compile.status === 'error') ctx.fillText('LAST GOOD PROGRAM RUNNING', this.left(396, 416), 406);
    const fy = this.vh - 26;
    ctx.fillText('SPACE play · R restart · Q quality', this.left(fy - 10, fy + 10), fy);
    this.end(ctx);
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
    super(cfg.library, cfg, 1.6);
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
    // Two columns, down the left one first.
    const step = 46;
    const rows = Math.ceil(this.actions.examples.length / 2);
    const x0 = this.left(96, 96 + rows * step);
    const mid = (x0 + this.right) / 2;
    this.actions.examples.forEach((name, i) => {
      const col = Math.floor(i / rows);
      const y = 96 + (i % rows) * step;
      const item = { id: `ex:${i}`, text: `${String(i + 1).padStart(2, '0')} ${name.toUpperCase()}`, active: name === current };
      this.buttonRow(ctx, y, step - 8, [item], 'left', col ? mid + 5 : x0, col ? this.right : mid - 5);
    });
    const y0 = 96 + rows * step + 12;
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
