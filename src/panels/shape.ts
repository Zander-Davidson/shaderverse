// Panel silhouettes: a rounded rectangle, optionally with a concave circular
// cut. Shapes are in panel pixels; the mesh supplies any curvature.

export interface Circle {
  x: number;
  y: number;
  r: number;
}

export class PanelShape {
  constructor(
    readonly width: number,
    readonly height: number,
    readonly corner: number,
    readonly cut: Circle | null,
    /** Inset of the outline from the texture edge. */
    readonly inset = 3,
  ) {}

  private roundRect(ctx: CanvasRenderingContext2D | Path2D, grow = 0) {
    const i = this.inset - grow;
    ctx.roundRect(i, i, this.width - 2 * i, this.height - 2 * i, Math.max(0, this.corner + grow));
  }

  /** Whether panel pixel (x, y) is part of the panel. */
  contains(x: number, y: number): boolean {
    const i = this.inset;
    const { width: W, height: H } = this;
    if (x < i || y < i || x > W - i || y > H - i) return false;
    const r = this.corner;
    const cx = Math.min(Math.max(x, i + r), W - i - r);
    const cy = Math.min(Math.max(y, i + r), H - i - r);
    if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) return false;
    return !this.cut || Math.hypot(x - this.cut.x, y - this.cut.y) > this.cut.r;
  }

  /** How far the rounded corners pull the outline in from the side at row y. */
  private cornerInset(y: number): number {
    const r = this.corner;
    const i = this.inset;
    const d = y < i + r ? i + r - y : y > this.height - i - r ? y - (this.height - i - r) : 0;
    return d > 0 ? r - Math.sqrt(Math.max(0, r * r - d * d)) : 0;
  }

  /** Rightmost clear x over rows y0..y1: inside the corners and left of a right-side cut. */
  rightLimit(y0: number, y1: number): number {
    let min = this.width - this.inset;
    for (let y = y0; y <= y1; y += 4) {
      min = Math.min(min, this.width - this.inset - this.cornerInset(y));
      const dy = y - (this.cut?.y ?? 0);
      if (this.cut && this.cut.x > this.width / 2 && Math.abs(dy) < this.cut.r) {
        min = Math.min(min, this.cut.x - Math.sqrt(this.cut.r ** 2 - dy * dy));
      }
    }
    return min;
  }

  /** Leftmost clear x over rows y0..y1: inside the corners and right of a left-side cut. */
  leftLimit(y0: number, y1: number): number {
    let max = this.inset;
    for (let y = y0; y <= y1; y += 4) {
      max = Math.max(max, this.inset + this.cornerInset(y));
      const dy = y - (this.cut?.y ?? 0);
      if (this.cut && this.cut.x < this.width / 2 && Math.abs(dy) < this.cut.r) {
        max = Math.max(max, this.cut.x + Math.sqrt(this.cut.r ** 2 - dy * dy));
      }
    }
    return max;
  }

  /** Fills the outline and clips subsequent drawing to it. Call restore() later. */
  begin(ctx: CanvasRenderingContext2D, fill: string | CanvasGradient): void {
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.beginPath();
    this.roundRect(ctx);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.clip();
  }

  /** Ends the clip, carves the cut, and strokes the edge (including the cut's arc). */
  finish(ctx: CanvasRenderingContext2D, edge: string, glow: string | null = null): void {
    ctx.restore();
    const lw = 4;
    if (this.cut) {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(this.cut.x, this.cut.y, this.cut.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.lineWidth = lw;
    ctx.strokeStyle = edge;
    // Outer outline, outside the cut.
    if (this.cut) {
      ctx.beginPath();
      ctx.rect(0, 0, this.width, this.height);
      ctx.arc(this.cut.x, this.cut.y, this.cut.r + lw / 2, 0, Math.PI * 2, true);
      ctx.clip();
    }
    ctx.beginPath();
    this.roundRect(ctx, -lw / 2);
    ctx.stroke();
    ctx.restore();
    if (this.cut) {
      // The concave edge, inside the outline.
      ctx.save();
      ctx.beginPath();
      this.roundRect(ctx);
      ctx.clip();
      ctx.lineWidth = lw;
      ctx.strokeStyle = edge;
      ctx.beginPath();
      ctx.arc(this.cut.x, this.cut.y, this.cut.r + lw / 2, 0, Math.PI * 2);
      ctx.stroke();
      if (glow) {
        // An emissive channel following the cut.
        ctx.lineWidth = 3;
        ctx.strokeStyle = glow;
        ctx.beginPath();
        ctx.arc(this.cut.x, this.cut.y, this.cut.r + 18, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}

/** The screen opening inside an outer silhouette, `bezel` pixels in. */
export function screenShapeFor(outer: PanelShape, bezel: number): PanelShape {
  const cut: Circle | null = outer.cut ? { ...outer.cut, r: outer.cut.r + bezel } : null;
  return new PanelShape(outer.width, outer.height, Math.max(10, outer.corner - bezel * 0.6), cut, outer.inset + bezel);
}
