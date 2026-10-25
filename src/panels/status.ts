// Status readout (compile state, frame rate, time, playback, quality) and the
// library panel (examples, import and export, shortcuts).

import type { LayoutConfig, Rect } from '../cockpit/layout';
import type { ProjectStore } from '../project/store';
import type { Quality, ShaderRuntime } from '../shader/runtime';
import { COLORS, MONO } from '../theme';
import { CanvasPanel } from './panel';

const PX_PER_UNIT = 256;

abstract class ReadoutPanel extends CanvasPanel {
  constructor(rect: Rect, radius: number) {
    super(rect, Math.round(rect.w * PX_PER_UNIT), Math.round(rect.h * PX_PER_UNIT), radius, 0.01);
  }

  protected frame(ctx: CanvasRenderingContext2D, title: string, tag: string) {
    const W = this.pixelWidth;
    const H = this.pixelHeight;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = COLORS.panelEdge;
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, W - 3, H - 3);
    ctx.fillStyle = '#0d151c';
    ctx.fillRect(3, 3, W - 6, 52);
    ctx.font = `600 20px ${MONO}`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLORS.accent;
    ctx.fillText(title, 20, 30);
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.dim;
    ctx.fillText(tag, W - 20, 30);
    ctx.textAlign = 'left';
  }

  protected label(ctx: CanvasRenderingContext2D, text: string, y: number) {
    ctx.font = `600 15px ${MONO}`;
    ctx.fillStyle = COLORS.dim;
    ctx.fillText(text, 20, y);
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
    ctx.fillStyle = active ? '#12303d' : hover ? '#15212b' : '#0e171e';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = active ? COLORS.accent : hover ? '#3c5262' : COLORS.faint;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = active ? COLORS.accent : hover ? COLORS.text : '#9fb0bd';
    ctx.font = `600 18px ${MONO}`;
    ctx.textAlign = align;
    ctx.fillText(text, align === 'center' ? x + w / 2 : x + 16, y + h / 2 + 1);
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
    super(cfg.status, cfg.radius);
    store.subscribe((s, p) => {
      if (s.compile !== p.compile || s.project.playback !== p.project.playback) this.invalidate();
    });
  }

  relayout(cfg: LayoutConfig) {
    this.rebuild(cfg.radius, cfg.status);
  }

  /** Readouts change every frame; redraw at most ten times a second. */
  tick(now: number) {
    if (now - this.lastDraw > 100) {
      this.lastDraw = now;
      this.invalidate();
    }
  }

  protected draw(ctx: CanvasRenderingContext2D): void {
    const W = this.pixelWidth;
    const { compile, project } = this.store.getState();
    this.frame(ctx, 'STATUS', 'UNIT C/7a');

    this.label(ctx, 'COMPILE', 88);
    const st =
      compile.status === 'ok'
        ? { t: 'NOMINAL', c: COLORS.ok }
        : compile.status === 'error'
          ? { t: `FAULT ×${compile.errors.length}`, c: COLORS.error }
          : { t: 'PENDING', c: COLORS.warn };
    ctx.fillStyle = st.c;
    ctx.beginPath();
    ctx.arc(W - 34, 88, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `600 30px ${MONO}`;
    ctx.fillText(st.t, 20, 124);

    const row = (label: string, value: string, y: number) => {
      this.label(ctx, label, y);
      ctx.font = `500 28px ${MONO}`;
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = 'right';
      ctx.fillText(value, W - 20, y);
      ctx.textAlign = 'left';
    };
    row('FPS', this.fps.toFixed(0), 178);
    row('TIME', `${this.runtime.time.toFixed(2)}s`, 222);
    row('FRAME', String(this.runtime.frame), 266);
    row('RES', `${this.runtime.size}²`, 310);

    ctx.fillStyle = COLORS.faint;
    ctx.fillRect(20, 340, W - 40, 2);
    this.label(ctx, 'PLAYBACK', 370);
    const bw = (W - 40 - 12) / 2;
    this.button(ctx, 'play', project.playback.playing ? '❚❚ PAUSE' : '▶ PLAY', 20, 390, bw, 64, !project.playback.playing);
    this.button(ctx, 'restart', '⟲ RESTART', 32 + bw, 390, bw, 64);

    this.label(ctx, 'QUALITY', 492);
    const qw = (W - 40 - 24) / 3;
    (['low', 'medium', 'high'] as Quality[]).forEach((q, i) => {
      this.button(ctx, `q:${q}`, q === 'medium' ? 'MED' : q.toUpperCase(), 20 + i * (qw + 12), 512, qw, 64, project.playback.quality === q);
    });

    ctx.font = `15px ${MONO}`;
    ctx.fillStyle = COLORS.dim;
    const warn = compile.status === 'error' ? 'LAST GOOD PROGRAM RUNNING' : '';
    ctx.fillText(warn, 20, 620);
    ctx.fillText('SPACE pause  ·  R restart  ·  Q quality', 20, this.pixelHeight - 36);
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
    super(cfg.library, cfg.radius);
    store.subscribe((s, p) => {
      if (s.project.name !== p.project.name) this.invalidate();
    });
  }

  relayout(cfg: LayoutConfig) {
    this.rebuild(cfg.radius, cfg.library);
  }

  protected draw(ctx: CanvasRenderingContext2D): void {
    const W = this.pixelWidth;
    const current = this.store.getState().project.name;
    this.frame(ctx, 'LIBRARY', 'v1.0');
    this.label(ctx, 'NEW FROM EXAMPLE', 84);
    this.actions.examples.forEach((name, i) => {
      this.button(ctx, `ex:${i}`, `${String(i + 1).padStart(2, '0')}  ${name.toUpperCase()}`, 20, 104 + i * 64, W - 40, 54, name === current, 'left');
    });
    const y0 = 104 + this.actions.examples.length * 64 + 20;
    ctx.fillStyle = COLORS.faint;
    ctx.fillRect(20, y0, W - 40, 2);
    this.label(ctx, 'FILE', y0 + 30);
    this.button(ctx, 'export', '↓ EXPORT PROJECT', 20, y0 + 50, W - 40, 54, false, 'left');
    this.button(ctx, 'import', '↑ IMPORT PROJECT', 20, y0 + 114, W - 40, 54, false, 'left');
    this.button(ctx, 'glsl', '↓ EXPORT .GLSL (BAKED)', 20, y0 + 178, W - 40, 54, false, 'left');
    this.button(ctx, 'help', '?  SHORTCUTS', 20, this.pixelHeight - 80, W - 40, 54, false, 'left');
  }

  protected onButton(id: string): void {
    if (id.startsWith('ex:')) this.actions.loadExample(Number(id.slice(3)));
    else if (id === 'export') this.actions.exportProject();
    else if (id === 'import') this.actions.importProject();
    else if (id === 'glsl') this.actions.exportGlsl();
    else if (id === 'help') this.actions.toggleHelp();
  }
}
