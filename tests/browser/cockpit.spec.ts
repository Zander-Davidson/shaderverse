import { test } from '@playwright/test';
import { expect, openApp } from './helpers';

test.beforeEach(async ({ page }) => openApp(page));

test('the cockpit renders', async ({ page }) => {
  await page.waitForTimeout(300);
  const shot = await page.screenshot();
  expect(shot.byteLength).toBeGreaterThan(50_000); // not a blank frame
  await expect(page).toHaveTitle('SHADERVERSE');
});

for (const radius of [22, 1e4]) {
  test(`a click at a panel's projected point maps to that panel pixel (radius ${radius})`, async ({ page }) => {
    const r = await page.evaluate((radius) => {
      const sv = (window as any).__sv;
      sv.cfg.radius = radius;
      sv.relayout();
      // Project known panel-pixel positions to the screen, then pick them back.
      const out: { u: number; v: number; pu: number; pv: number }[] = [];
      const mesh = sv.code.mesh;
      const pos = mesh.geometry.getAttribute('position');
      const uv = mesh.geometry.getAttribute('uv');
      const rect = sv.canvas.getBoundingClientRect();
      // Interior grid vertices (49 per row): center, near each corner.
      for (const i of [49 * 24 + 24, 49 * 4 + 4, 49 * 4 + 44, 49 * 44 + 4, 49 * 44 + 44]) {
        const p = new (mesh.position.constructor)(pos.getX(i), pos.getY(i), pos.getZ(i));
        p.project(sv.cockpit.camera);
        const x = rect.left + ((p.x + 1) / 2) * rect.width;
        const y = rect.top + ((1 - p.y) / 2) * rect.height;
        const hit = sv.router.pickClient(x, y);
        out.push({ u: uv.getX(i), v: uv.getY(i), pu: hit?.u ?? NaN, pv: hit?.v ?? NaN });
      }
      return out;
    }, radius);
    for (const h of r) {
      expect(Math.abs(h.u - h.pu)).toBeLessThan(0.01);
      expect(Math.abs(h.v - h.pv)).toBeLessThan(0.01);
    }
  });
}

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
  await page.mouse.move(portal.x + 20, portal.y - 20);
  const m = await page.evaluate(() => {
    const u = (window as any).__sv.runtime.material.uniforms.iMouse.value;
    return { x: u.x, y: u.y, z: u.z, size: (window as any).__sv.runtime.size };
  });
  await page.mouse.up();
  expect(m.z).toBeGreaterThan(0);
  expect(Math.abs(m.x / m.size - 0.5)).toBeLessThan(0.1);
  expect(m.y / m.size).toBeGreaterThan(0.5); // dragged up → larger y (origin bottom-left)
});

test('the status panel toggles playback', async ({ page }) => {
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => (window as any).__sv.store.getState().project.playback.playing)).toBe(false);
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => (window as any).__sv.store.getState().project.playback.playing)).toBe(true);
});

test('clicking the portal leans in until the portal and knobs fill the view; Escape leans out', async ({ page }) => {
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
      const ys = [0, 7].map((i: number) => sv.knobPoint(i).y); // top and bottom knobs
      return Math.abs(ys[1] - ys[0]) / window.innerHeight;
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

test('clicks in the space carved out of a panel pass through', async ({ page }) => {
  // A point inside the status panel's rectangle but inside the portal's clearance circle.
  const hit = await page.evaluate(() => {
    const sv = (window as any).__sv;
    const { status, portal, clearance, radius } = sv.cfg;
    const rClear = (portal.size / 2) * 1.15 + 0.04 + clearance;
    const wx = portal.x + rClear - 0.1; // just inside the circle
    const wy = portal.y + 0.15;
    const inRect = wx > status.x - status.w / 2 && wy > status.y - status.h / 2;
    const az = wx / radius;
    const el = wy / radius;
    const P = new (sv.cockpit.camera.position.constructor)(-radius * Math.cos(el) * Math.sin(az), radius * Math.sin(el), radius * Math.cos(el) * Math.cos(az));
    P.project(sv.cockpit.camera);
    const r = sv.canvas.getBoundingClientRect();
    const t = sv.router.pickClient(r.left + ((P.x + 1) / 2) * r.width, r.top + ((1 - P.y) / 2) * r.height);
    return { inRect, isPanel: t?.target === sv.status };
  });
  expect(hit.inRect).toBe(true);
  expect(hit.isPanel).toBe(false);
});
