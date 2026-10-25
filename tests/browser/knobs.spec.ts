import { test } from '@playwright/test';
import { expect, openApp, pause, sampleTarget, setSource, state } from './helpers';

const SRC = `void mainImage(out vec4 fragColor, in vec2 fragCoord, in float red)
{
    fragColor = vec4(red, 0.0, 0.0, 1.0);
}`;

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await setSource(page, SRC);
  await pause(page);
  // Hand-typed parameters become knobs with a -1..1 range at 0.
  const s = await state(page);
  await page.evaluate(
    (id) => {
      const d = (window as any).__sv.store.getState().dispatch;
      d({ type: 'updateKnob', id, patch: { min: 0, max: 1 } });
      d({ type: 'setKnobValue', id, value: 0.1 });
    },
    s.project.knobs[0].id,
  );
});

test('dragging a knob changes the image without recompiling', async ({ page }) => {
  const count = (await state(page)).compileCount;
  await page.waitForTimeout(100);
  const [r0] = await sampleTarget(page);
  const p = await page.evaluate(() => (window as any).__sv.knobPoint(0));
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(p.x, p.y - i * 15);
  await page.mouse.up();
  const s = await state(page);
  expect(s.project.knobs[0].value).toBeGreaterThan(0.5);
  expect(s.compileCount).toBe(count);
  await page.waitForTimeout(100);
  const [r1] = await sampleTarget(page);
  expect(r1!).toBeGreaterThan(r0! + 80);
});

test('double-click resets; the popover renames and bakes', async ({ page }) => {
  const p = await page.evaluate(() => (window as any).__sv.knobPoint(0));
  await page.mouse.dblclick(p.x, p.y);
  await expect.poll(async () => (await state(page)).project.knobs[0].value).toBe(0);

  await page.mouse.click(p.x, p.y, { button: 'right' });
  const pop = page.locator('.sv-popover');
  await expect(pop).toBeVisible();
  await pop.locator('input[name=param]').fill('crimson');
  await pop.locator('input[name=param]').press('Enter');
  await expect.poll(async () => (await state(page)).project.knobs[0].param).toBe('crimson');
  let s = await state(page);
  expect(s.project.source).toContain('in float crimson)');
  expect(s.project.source).toContain('vec4(crimson,');
  expect(s.project.knobs[0].label).toBe('crimson');

  await pop.locator('input[name=max]').fill('5');
  await pop.locator('input[name=max]').press('Enter');
  await expect.poll(async () => (await state(page)).project.knobs[0].max).toBe(5);

  await page.evaluate((id) => (window as any).__sv.store.getState().dispatch({ type: 'setKnobValue', id, value: 0.75 }), s.project.knobs[0].id);
  await pop.locator('.sv-pop-delete').click();
  await expect.poll(async () => (await state(page)).project.knobs.length).toBe(0);
  s = await state(page);
  expect(s.project.source).toContain('void mainImage(out vec4 fragColor, in vec2 fragCoord)');
  expect(s.project.source).toContain('vec4(0.75,');
  await expect(pop).toBeHidden();
});

test('reloading restores the project', async ({ page }) => {
  await page.waitForTimeout(600); // autosave debounce
  await page.reload();
  await page.waitForFunction(() => (window as any).__sv?.store.getState().compile.status === 'ok');
  const s = await state(page);
  expect(s.project.source).toBe(SRC);
  expect(s.project.knobs[0]).toMatchObject({ param: 'red', value: 0.1, max: 1 });
});
