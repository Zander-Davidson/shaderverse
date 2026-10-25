import { expect, type Page } from '@playwright/test';

/** Loads the app with a fresh project and waits for the first compile. */
export async function openApp(page: Page) {
  await page.goto('/?noboot');
  await page.waitForFunction(() => {
    const sv = (window as any).__sv;
    return sv && sv.store.getState().compile.status === 'ok' && sv.runtime.frame > 2;
  });
}

/** Loads a source into the store and waits for it to compile (or fail). */
export async function setSource(page: Page, source: string) {
  await page.evaluate((src) => (window as any).__sv.store.getState().dispatch({ type: 'setSource', source: src }), source);
  await page.waitForFunction((src) => (window as any).__sv.store.getState().compile.source === src, source);
}

/** Average RGB over a patch of the shader render target. */
export async function sampleTarget(page: Page, x = 0.5, y = 0.5, size = 24): Promise<number[]> {
  return page.evaluate(
    ({ x, y, size }) => {
      const { renderer, runtime } = (window as any).__sv;
      const s = runtime.size;
      const buf = new Uint8Array(size * size * 4);
      renderer.readRenderTargetPixels(runtime.target, Math.floor(x * s - size / 2), Math.floor(y * s - size / 2), size, size, buf);
      const sum = [0, 0, 0];
      for (let i = 0; i < buf.length; i += 4) for (let c = 0; c < 3; c++) sum[c]! += buf[i + c]!;
      return sum.map((v) => v / (size * size));
    },
    { x, y, size },
  );
}

export async function pause(page: Page) {
  await page.evaluate(() => (window as any).__sv.store.getState().dispatch({ type: 'setPlayback', playing: false }));
}

export const state = (page: Page) => page.evaluate(() => {
  const s = (window as any).__sv.store.getState();
  return { project: s.project, compile: s.compile, ui: s.ui, compileCount: (window as any).__sv.runtime.compileCount };
});

export const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

export { expect };
