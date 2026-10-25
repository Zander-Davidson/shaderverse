// Recessed LCD screens: dark phosphor glass with scanlines and a halftone
// falloff toward the edges, and a glossy glare on top. Both layers are static
// for a given size, so they are rendered once and cached.

const cache = new Map<string, HTMLCanvasElement>();

function cached(key: string, w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const k = `${key}:${w}x${h}`;
  let c = cache.get(k);
  if (!c) {
    c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    paint(c.getContext('2d')!);
    cache.set(k, c);
  }
  return c;
}

export const PHOSPHOR = '#3ff2c4';

/** Halftone dots whose size follows `coverage(x, y)` in 0..1. */
function halftone(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  spacing: number,
  color: string,
  coverage: (x: number, y: number) => number,
) {
  ctx.fillStyle = color;
  for (let y = spacing / 2, row = 0; y < h; y += spacing * 0.866, row++) {
    for (let x = (row % 2 ? spacing / 2 : 0) + spacing / 4; x < w; x += spacing) {
      const r = (spacing / 2) * Math.sqrt(Math.max(0, Math.min(1, coverage(x, y))));
      if (r < 0.4) continue;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function drawScreenBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const img = cached('backdrop', w, h, (c) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#06110f');
    g.addColorStop(0.5, '#040b0b');
    g.addColorStop(1, '#071413');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    // Halftone glow pooling at the edges, like light bleeding through the glass.
    halftone(c, w, h, 9, 'rgba(63, 242, 196, 0.07)', (x, y) => {
      const ex = Math.min(x, w - x) / (w * 0.5);
      const ey = Math.min(y, h - y) / (h * 0.5);
      const edge = 1 - Math.min(ex * 2.2, ey * 2.6, 1);
      return edge * edge;
    });
    // Scanlines.
    c.fillStyle = 'rgba(0, 0, 0, 0.28)';
    for (let y = 0; y < h; y += 3) c.fillRect(0, y, w, 1);
  });
  ctx.drawImage(img, 0, 0);
}

export function drawScreenGlare(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const img = cached('glare', w, h, (c) => {
    // A broad diagonal reflection across the top of the glass.
    c.save();
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(w * 0.95, 0);
    c.bezierCurveTo(w * 0.6, h * 0.08, w * 0.25, h * 0.2, 0, h * 0.42);
    c.closePath();
    const g = c.createLinearGradient(0, 0, w * 0.3, h * 0.4);
    g.addColorStop(0, 'rgba(210, 255, 245, 0.10)');
    g.addColorStop(1, 'rgba(210, 255, 245, 0)');
    c.fillStyle = g;
    c.fill();
    c.restore();
    // Inner shadow where the glass meets the chassis lip.
    const s = Math.min(w, h) * 0.05;
    for (const [x0, y0, x1, y1, ww, hh] of [
      [0, 0, 0, s, w, s],
      [0, h, 0, h - s, w, -s],
      [0, 0, s, 0, s, h],
      [w, 0, w - s, 0, -s, h],
    ] as const) {
      const sg = c.createLinearGradient(x0, y0, x1, y1);
      sg.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
      sg.addColorStop(1, 'rgba(0, 0, 0, 0)');
      c.fillStyle = sg;
      c.fillRect(x0, y0, ww, hh);
    }
  });
  ctx.drawImage(img, 0, 0);
}

/**
 * A glossy gel button (Frutiger-era): rounded, a bright highlight across the
 * upper half, and an inner glow when active.
 */
export function gelButton(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  state: { active?: boolean; hover?: boolean; tint?: string },
): void {
  const tint = state.tint ?? PHOSPHOR;
  const r = Math.min(h / 2, 18);
  ctx.save();
  // Drop shadow into the screen.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.beginPath();
  ctx.roundRect(x + 2, y + 4, w, h, r);
  ctx.fill();
  // Body
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  if (state.active) {
    g.addColorStop(0, '#2fd9ae');
    g.addColorStop(0.5, '#0c7a64');
    g.addColorStop(1, '#0a5a4b');
  } else {
    g.addColorStop(0, state.hover ? '#3a5258' : '#2b3c41');
    g.addColorStop(0.5, state.hover ? '#1a2a2e' : '#131e21');
    g.addColorStop(1, '#0b1214');
  }
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  // Rim
  ctx.lineWidth = 2;
  ctx.strokeStyle = state.active ? `${tint}` : state.hover ? '#6d8a90' : '#3c5056';
  ctx.stroke();
  // Gloss highlight over the upper half.
  const hg = ctx.createLinearGradient(0, y + 2, 0, y + h * 0.55);
  hg.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
  hg.addColorStop(1, 'rgba(255, 255, 255, 0.02)');
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.roundRect(x + 4, y + 3, w - 8, h * 0.48, [r - 3, r - 3, r * 0.6, r * 0.6]);
  ctx.fill();
  if (state.active) {
    ctx.shadowColor = tint;
    ctx.shadowBlur = 18;
    ctx.strokeStyle = `${tint}aa`;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.stroke();
  }
  ctx.restore();
}
