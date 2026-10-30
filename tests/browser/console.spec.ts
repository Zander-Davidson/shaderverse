import { test } from '@playwright/test';
import { expect, openApp, sampleTarget, setSource, state } from './helpers';

const SRC = `void mainImage(out vec4 fragColor, in vec2 fragCoord, in float red)
{
    fragColor = vec4(red, 0.0, 0.0, 1.0);
}`;

test.beforeEach(async ({ page }) => openApp(page));

const click = async (page: import('@playwright/test').Page, id: string) => {
  const p = await page.evaluate((id) => (window as any).__sv.controlPoint(id), id);
  await page.mouse.click(p.x, p.y);
};

test('the console buttons play, pause, restart and set the quality', async ({ page }) => {
  await click(page, 'play');
  await expect.poll(async () => (await state(page)).project.playback.playing).toBe(false);
  await click(page, 'play');
  await expect.poll(async () => (await state(page)).project.playback.playing).toBe(true);

  const restarts = (await state(page)).ui.restartCount;
  await click(page, 'restart');
  await expect.poll(async () => (await state(page)).ui.restartCount).toBe(restarts + 1);

  await click(page, 'q-high');
  await expect.poll(async () => (await state(page)).project.playback.quality).toBe('high');
  await click(page, 'q-low');
  await expect.poll(async () => (await state(page)).project.playback.quality).toBe('low');
});

test('decorative controls press without changing the project', async ({ page }) => {
  const before = (await state(page)).project;
  for (const id of ['toggle-1', 'key-2']) await click(page, id);
  expect((await state(page)).project.playback).toEqual(before.playback);
});

test('hovering a knob lights its parameter in the code, and the other way round', async ({ page }) => {
  await setSource(page, SRC);
  const k = await page.evaluate(() => (window as any).__sv.knobPoint(0));
  await page.mouse.move(k.x, k.y);
  await expect.poll(() => page.evaluate(() => (window as any).__sv.code.linkedParam)).toBe('red');

  // The parameter where the body uses it, on the code monitor. Pointing at
  // the code turns the head toward it, so aim again once turned.
  const at = SRC.lastIndexOf('red');
  for (let i = 0; i < 2; i++) {
    const p = await page.evaluate((at) => (window as any).__sv.codePoint(at + 1), at);
    await page.mouse.move(p.x, p.y);
    await expect.poll(() => page.evaluate(() => (window as any).__sv.cockpit.view)).toBe('left');
  }
  await expect.poll(() => page.evaluate(() => (window as any).__sv.knobs.slots[0].face.linked)).toBe(true);
});

test('the BAKE key locks the knobs and uncovers bake all, which bakes them all in one change', async ({ page }) => {
  await setSource(page, SRC);
  await page.evaluate(() => {
    const d = (window as any).__sv.store.getState().dispatch;
    d({ type: 'setPlayback', playing: false });
  });
  const id = (await state(page)).project.knobs[0].id;
  await page.evaluate((id) => (window as any).__sv.store.getState().dispatch({ type: 'setKnobValue', id, value: 0.6 }), id);
  await page.waitForTimeout(150);
  const [before] = await sampleTarget(page);

  // Covered, the bake all button doesn't take a click.
  const all = await page.evaluate(() => (window as any).__sv.bakeAllPoint());
  await page.mouse.click(all.x, all.y);
  await page.waitForTimeout(300);
  expect((await state(page)).project.knobs).toHaveLength(1);

  const key = await page.evaluate(() => (window as any).__sv.bakeKeyPoint());
  await page.mouse.click(key.x, key.y);
  await expect.poll(async () => (await state(page)).ui.bakeArmed).toBe(true);

  // Armed, knobs ignore drags and clicks.
  const k = await page.evaluate(() => (window as any).__sv.knobPoint(0));
  await page.mouse.move(k.x, k.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(k.x, k.y - i * 15);
  await page.mouse.up();
  await page.mouse.click(k.x, k.y);
  await page.waitForTimeout(350);
  let s = await state(page);
  expect(s.project.knobs[0].value).toBe(0.6);
  expect(s.ui.editKnobId).toBeNull();

  await page.waitForTimeout(400); // the guard swings open
  const logOf = () => page.evaluate(() => (window as any).__sv.store.getState().log.map((e: any) => e.action.type) as string[]);
  const log = (await logOf()).length;
  const open = await page.evaluate(() => (window as any).__sv.bakeAllPoint());
  await page.mouse.click(open.x, open.y);
  await expect.poll(async () => (await state(page)).project.knobs.length).toBe(0);
  s = await state(page);
  expect(s.project.source).toContain('void mainImage(out vec4 fragColor, in vec2 fragCoord)');
  // One source change, so one undo brings every knob back.
  const after_ = await logOf();
  expect(after_.slice(log)).toEqual(['bakeAllKnobs']);
  // Still armed, with nothing left to bake.
  expect(s.ui.bakeArmed).toBe(true);
  await expect.poll(async () => (await state(page)).compile.status).toBe('ok');
  await page.waitForTimeout(150);
  const [after] = await sampleTarget(page);
  expect(Math.abs(after! - before!)).toBeLessThan(3);

  const back = await page.evaluate(() => (window as any).__sv.bakeKeyPoint());
  await page.mouse.click(back.x, back.y);
  await expect.poll(async () => (await state(page)).ui.bakeArmed).toBe(false);
});
