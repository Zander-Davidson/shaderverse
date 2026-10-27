import { test } from '@playwright/test';
import { expect, openApp, setSource, state } from './helpers';

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
