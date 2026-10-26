// Function plot: a coordinate plane above the source. Hovering a standard
// library function name in the code shows its basic form here, with its name
// and formula. No numbers on purpose: it shows the shape, not the values.

import type { LayoutConfig } from '../cockpit/layout';
import type { StdFunction } from '../shader/stdlib';
import { drawScreenBackdrop, drawScreenGlare, PHOSPHOR } from '../style/screen';
import { COLORS, MONO, SANS } from '../theme';
import { CanvasPanel } from './panel';
import { PanelShape } from './shape';

const PLANE_BG = '#04070a';
const GRID = 'rgba(63, 242, 196, 0.07)';
const AXES = '#8fb8ad';
const PAD = 14;
/** Texels per wall unit, matching the code panel. */
const PX_PER_UNIT = 280;
const BEZEL = Math.round(0.2 * PX_PER_UNIT);

export class PlotPanel extends CanvasPanel {
  private fn: StdFunction | null = null;

  constructor(cfg: LayoutConfig) {
    super(cfg.plot, Math.round(cfg.plot.w * PX_PER_UNIT), Math.round(cfg.plot.h * PX_PER_UNIT), cfg.radius, 0.01);
    this.reshape(cfg);
    void document.fonts?.ready.then(() => this.invalidate());
  }

  /** The function currently plotted, or null for the empty plane. */
  get current(): StdFunction | null {
    return this.fn;
  }

  show(fn: StdFunction | null): void {
    if (fn === this.fn) return;
    this.fn = fn;
    this.invalidate();
  }

  relayout(cfg: LayoutConfig) {
    this.pixelWidth = this.canvas.width = Math.round(cfg.plot.w * PX_PER_UNIT);
    this.pixelHeight = this.canvas.height = Math.round(cfg.plot.h * PX_PER_UNIT);
    this.rebuild(cfg.radius, cfg.plot);
    this.reshape(cfg);
    this.invalidate();
  }

  private reshape(cfg: LayoutConfig) {
    const W = this.pixelWidth;
    const outer = new PanelShape(W, this.pixelHeight, (cfg.cornerRadius / cfg.plot.w) * W, null);
    this.setBezel(outer, BEZEL);
  }

  protected draw(ctx: CanvasRenderingContext2D): void {
    const W = this.iw;
    const H = this.ih;
    const fn = this.fn;

    // Screen, like the code panel's; lay out in screen coordinates.
    this.shape!.begin(ctx, COLORS.panel);
    ctx.translate(this.ox, this.oy);
    drawScreenBackdrop(ctx, W, H);

    // The plane: square units, x spanning ±span around cx.
    const x0 = PAD;
    const y0 = PAD;
    const pw = W - PAD * 2;
    const ph = H - PAD * 2;
    ctx.fillStyle = PLANE_BG;
    ctx.fillRect(x0, y0, pw, ph);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, pw, ph);
    ctx.clip();

    const span = fn?.span ?? 4;
    const cx = fn?.cx ?? 0;
    const cy = fn?.cy ?? 0;
    const scale = pw / (span * 2);
    const ySpan = ph / 2 / scale;
    const sx = (x: number) => x0 + pw / 2 + (x - cx) * scale;
    const sy = (y: number) => y0 + ph / 2 - (y - cy) * scale;

    // Grid: a line every unit, thinned out so cells stay at least ~36px.
    const step = Math.max(1, 2 ** Math.ceil(Math.log2(36 / scale)));
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let gx = Math.ceil((cx - span) / step) * step; gx <= cx + span; gx += step) {
      ctx.moveTo(Math.round(sx(gx)), y0);
      ctx.lineTo(Math.round(sx(gx)), y0 + ph);
    }
    for (let gy = Math.ceil((cy - ySpan) / step) * step; gy <= cy + ySpan; gy += step) {
      ctx.moveTo(x0, Math.round(sy(gy)));
      ctx.lineTo(x0 + pw, Math.round(sy(gy)));
    }
    ctx.stroke();

    // Axes
    ctx.strokeStyle = AXES;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x0, sy(0));
    ctx.lineTo(x0 + pw, sy(0));
    ctx.moveTo(sx(0), y0);
    ctx.lineTo(sx(0), y0 + ph);
    ctx.stroke();

    if (fn) this.drawCurve(ctx, fn, x0, pw, cx, sy, cy, ySpan);
    ctx.restore();

    // Name and formula, top left; a hint when nothing is plotted.
    ctx.textBaseline = 'top';
    if (fn) {
      ctx.font = `700 48px ${MONO}`;
      const nameW = ctx.measureText(fn.name).width;
      ctx.font = `500 41px ${SANS}`;
      const formW = ctx.measureText(fn.form).width;
      ctx.fillStyle = 'rgba(4, 7, 10, 0.82)';
      ctx.fillRect(x0 + 10, y0 + 10, Math.max(nameW, formW) + 36, 132);
      ctx.font = `700 48px ${MONO}`;
      ctx.fillStyle = PHOSPHOR;
      ctx.fillText(fn.name, x0 + 28, y0 + 24);
      ctx.font = `500 41px ${SANS}`;
      ctx.fillStyle = COLORS.text;
      ctx.fillText(fn.form, x0 + 28, y0 + 86);
    } else {
      ctx.font = `600 29px ${MONO}`;
      ctx.fillStyle = COLORS.dim;
      ctx.fillText('PLOT · HOVER A FUNCTION NAME IN THE SOURCE', x0 + 24, y0 + 20);
    }
    drawScreenGlare(ctx, W, H);
    this.shape!.finish(ctx, COLORS.panelEdge, '#3ff2c422');
  }

  private drawCurve(
    ctx: CanvasRenderingContext2D,
    fn: StdFunction,
    x0: number,
    pw: number,
    cx: number,
    sy: (y: number) => number,
    cy: number,
    ySpan: number,
  ) {
    const lo = cy - ySpan * 1.5;
    const hi = cy + ySpan * 1.5;
    ctx.beginPath();
    let pen = false;
    let prev = NaN;
    // One sample per pixel; break the line at gaps, poles and jumps
    // (1/x, tan, floor) instead of drawing a vertical wall.
    for (let px = x0; px <= x0 + pw; px += 1) {
      const x = cx + ((px - x0) / pw - 0.5) * fn.span * 2;
      const y = fn.f(x);
      const ok = Number.isFinite(y) && y > lo && y < hi;
      const jump = Number.isFinite(prev) && Math.abs(y - prev) > ySpan * 0.5;
      if (!ok) {
        pen = false;
      } else if (!pen || jump) {
        ctx.moveTo(px, sy(y));
        pen = true;
      } else {
        ctx.lineTo(px, sy(y));
      }
      prev = y;
    }
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.save();
    ctx.shadowColor = PHOSPHOR;
    ctx.shadowBlur = 24;
    ctx.strokeStyle = PHOSPHOR;
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.restore();
  }
}
