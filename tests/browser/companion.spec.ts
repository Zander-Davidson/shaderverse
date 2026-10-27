import { test, type Page } from '@playwright/test';
import { expect, openApp, state } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('shaderverse.companion.hidden'));
  await openApp(page);
});

/** Moves the camera to a view and waits for the companion to choose its perch there. */
async function enterView(page: Page, view: 'neutral' | 'left' | 'right' | 'lean') {
  await page.evaluate((view) => {
    const sv = (window as any).__sv;
    sv.store.getState().dispatch({ type: 'setLean', lean: view === 'lean' });
    sv.cockpit.setFocus(view === 'left' || view === 'right' ? view : null);
  }, view);
  await page.waitForFunction((view) => {
    const sv = (window as any).__sv;
    return sv.cockpit.view === view && !sv.cockpit.leaning && sv.companion.perch;
  }, view);
  // A recheck after the view change.
  await page.waitForTimeout(400);
}

/** The companion's center on screen. */
const companionPoint = (page: Page) =>
  page.evaluate(() => {
    const sv = (window as any).__sv;
    const v = sv.companion.body.mesh.position.clone().project(sv.cockpit.camera);
    const r = sv.canvas.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  });

for (const view of ['neutral', 'left', 'right', 'lean'] as const) {
  test(`perches clear of panels, the portal and knobs (${view})`, async ({ page }) => {
    await enterView(page, view);
    const r = await page.evaluate(() => {
      const sv = (window as any).__sv;
      const { perch } = sv.companion;
      const zones = sv.companion.keepOut(sv.cockpit.camera);
      const W = sv.canvas.clientWidth;
      const H = sv.canvas.clientHeight;
      const inCircle = zones.circles.some((c: any) => Math.hypot(perch.x - c.x, perch.y - c.y) < c.r);
      const inBox = zones.boxes.some((b: any) => perch.x > b.left && perch.x < b.right && perch.y > b.top && perch.y < b.bottom);
      return { index: perch.index, inCircle, inBox, onScreen: perch.x > 0 && perch.x < W && perch.y > 0 && perch.y < H };
    });
    expect(r.index).toBeGreaterThanOrEqual(0);
    expect(r).toMatchObject({ inCircle: false, inBox: false, onScreen: true });
  });
}

test('knobs and the portal still take their own clicks', async ({ page }) => {
  for (const view of ['neutral', 'lean'] as const) {
    await enterView(page, view);
    const hits = await page.evaluate(() => {
      const sv = (window as any).__sv;
      const out: boolean[] = [];
      for (let i = 0; i < sv.knobs.slots.length; i++) {
        const p = sv.knobPoint(i);
        out.push(sv.router.pickClient(p.x, p.y)?.target === sv.knobs.slots[i]);
      }
      return out;
    });
    expect(hits.every(Boolean)).toBe(true);
  }
});

test('clicking it squishes it and changes nothing else', async ({ page }) => {
  const p = await companionPoint(page);
  const picked = await page.evaluate(({ x, y }) => {
    const sv = (window as any).__sv;
    return sv.router.pickClient(x, y)?.target === sv.companion;
  }, p);
  expect(picked).toBe(true);
  const before = await state(page);
  await page.mouse.click(p.x, p.y);
  await expect.poll(() => page.evaluate(() => Math.abs((window as any).__sv.companion.squish))).toBeGreaterThan(0.01);
  const after = await state(page);
  expect(after.ui.lean).toBe(false);
  expect(after.ui.editorOpen).toBe(false);
  expect(after.project.source).toBe(before.project.source);
});

test('C hides it behind a small control that brings it back', async ({ page }) => {
  await page.locator('canvas').focus();
  await page.keyboard.press('c');
  const call = page.getByRole('button', { name: 'Bring the companion back' });
  await expect(call).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).__sv.companion.body.mesh.visible)).toBe(false);
  await call.click();
  await expect(call).toBeHidden();
  await expect.poll(() => page.evaluate(() => (window as any).__sv.companion.body.mesh.visible)).toBe(true);
});
