import { test } from '@playwright/test';
import { expect, openApp } from './helpers';

test.beforeEach(async ({ page }) => openApp(page));

test('the cockpit renders', async ({ page }) => {
  await page.waitForTimeout(300);
  const shot = await page.screenshot();
  expect(shot.byteLength).toBeGreaterThan(50_000); // not a blank frame
  await expect(page).toHaveTitle('SHADERVERSE');
});

test("a click at a point on the code monitor's bulging screen maps to that panel pixel", async ({ page }) => {
  const r = await page.evaluate(() => {
    const sv = (window as any).__sv;
    const code = sv.code;
    const rect = sv.canvas.getBoundingClientRect();
    // Project known panel pixels on the convex glass to the screen, then pick them back.
    const out: { u: number; v: number; pu: number; pv: number }[] = [];
    const uvs: [number, number][] = [[0.5, 0.5], [0.15, 0.15], [0.85, 0.15], [0.15, 0.85], [0.85, 0.85]];
    for (const [u, v] of uvs) {
      const p = code.pointAt(u * code.pixelWidth, (1 - v) * code.pixelHeight).project(sv.cockpit.camera);
      const hit = sv.router.pickClient(rect.left + ((p.x + 1) / 2) * rect.width, rect.top + ((1 - p.y) / 2) * rect.height);
      out.push({ u, v, pu: hit?.target === code ? hit.u : NaN, pv: hit?.target === code ? hit.v : NaN });
    }
    return out;
  });
  for (const h of r) {
    expect(Math.abs(h.u - h.pu)).toBeLessThan(0.01);
    expect(Math.abs(h.v - h.pv)).toBeLessThan(0.01);
  }
});

test('portal input becomes iMouse in shader pixels', async ({ page }) => {
  const portal = await page.evaluate(() => {
    const sv = (window as any).__sv;
    const m = sv.portal.mesh;
    m.geometry.computeBoundingBox();
    const c = m.geometry.boundingBox.getCenter(new (m.position.constructor)());
    c.project(sv.cockpit.camera);
    const r = sv.canvas.getBoundingClientRect();
    return { x: r.left + ((c.x + 1) / 2) * r.width, y: r.top + ((1 - c.y) / 2) * r.height };
  });
  await page.mouse.move(portal.x, portal.y);
  await page.mouse.down();
  // A short drag up and right: 1% of the window each way.
  const d = page.viewportSize()!.width / 100;
  await page.mouse.move(portal.x + d, portal.y - d);
  const m = await page.evaluate(() => {
    const u = (window as any).__sv.runtime.material.uniforms.iMouse.value;
    const rt = (window as any).__sv.runtime;
    return { x: u.x, y: u.y, z: u.z, w: rt.width, h: rt.height };
  });
  await page.mouse.up();
  expect(m.z).toBeGreaterThan(0);
  expect(Math.abs(m.x / m.w - 0.5)).toBeLessThan(0.1);
  expect(m.y / m.h).toBeGreaterThan(0.5); // dragged up → larger y (origin bottom-left)
});

test('Space toggles playback', async ({ page }) => {
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => (window as any).__sv.store.getState().project.playback.playing)).toBe(false);
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => (window as any).__sv.store.getState().project.playback.playing)).toBe(true);
});

test('clicking the portal leans in until the portal and knobs fill the view; Escape leans out', async ({ page }) => {
  // Two camera moves and several clicks, on a software GPU.
  test.slow();
  const portalCenter = () =>
    page.evaluate(() => {
      const sv = (window as any).__sv;
      const m = sv.portal.mesh;
      m.geometry.computeBoundingBox();
      const c = m.geometry.boundingBox.getCenter(new (m.position.constructor)());
      c.project(sv.cockpit.camera);
      const r = sv.canvas.getBoundingClientRect();
      return { x: r.left + ((c.x + 1) / 2) * r.width, y: r.top + ((1 - c.y) / 2) * r.height };
    });
  const knobSpan = () =>
    page.evaluate(() => {
      const sv = (window as any).__sv;
      const xs = [0, 7].map((i: number) => sv.knobPoint(i).x); // first and last knobs
      return Math.abs(xs[1] - xs[0]) / window.innerWidth;
    });

  const sitting = await knobSpan();
  const c = await portalCenter();
  await page.mouse.click(c.x, c.y);
  await expect.poll(() => page.evaluate(() => (window as any).__sv.store.getState().ui.lean)).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as any).__sv.cockpit.leaning), { timeout: 15_000 }).toBe(false);
  const leaned = await knobSpan();
  expect(leaned).toBeGreaterThan(sitting * 1.4);
  expect(leaned).toBeLessThan(0.95); // the outer knobs stay on screen

  // Knobs keep working while leaned in, without leaning out.
  const k = await page.evaluate(() => (window as any).__sv.knobPoint(0));
  await page.mouse.dblclick(k.x, k.y);
  expect(await page.evaluate(() => (window as any).__sv.store.getState().ui.lean)).toBe(true);

  // Back over the portal, so sitting back doesn't also turn toward a side.
  await page.mouse.move(c.x, c.y);
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => (window as any).__sv.store.getState().ui.lean)).toBe(false);
  await expect.poll(() => page.evaluate(() => (window as any).__sv.cockpit.leaning), { timeout: 15_000 }).toBe(false);
  expect(Math.abs((await knobSpan()) - sitting)).toBeLessThan(0.01);
});

test('dragging on the portal is mouse input, not a lean', async ({ page }) => {
  const c = await page.evaluate(() => {
    const sv = (window as any).__sv;
    const m = sv.portal.mesh;
    m.geometry.computeBoundingBox();
    const p = m.geometry.boundingBox.getCenter(new (m.position.constructor)());
    p.project(sv.cockpit.camera);
    const r = sv.canvas.getBoundingClientRect();
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
  });
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 40, c.y - 30, { steps: 4 });
  await page.mouse.up();
  expect(await page.evaluate(() => (window as any).__sv.store.getState().ui.lean)).toBe(false);
});

test('clicks in the open air between monitors pass through', async ({ page }) => {
  // Midway between the plot's bottom edge and the code's top edge.
  const hit = await page.evaluate(() => {
    const sv = (window as any).__sv;
    const { plot, code } = sv;
    const a = plot.pointAt(plot.pixelWidth / 2, plot.pixelHeight);
    const b = code.pointAt(code.pixelWidth / 2, 0);
    const P = a.add(b).multiplyScalar(0.5).project(sv.cockpit.camera);
    const r = sv.canvas.getBoundingClientRect();
    const t = sv.router.pickClient(r.left + ((P.x + 1) / 2) * r.width, r.top + ((1 - P.y) / 2) * r.height);
    return { isMonitor: t?.target === plot || t?.target === code };
  });
  expect(hit.isMonitor).toBe(false);
});
