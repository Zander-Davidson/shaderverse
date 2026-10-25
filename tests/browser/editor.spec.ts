import { test } from '@playwright/test';
import { expect, MOD, openApp, pause, sampleTarget, setSource, state } from './helpers';

const SRC = `void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
    float red = 0.2;
    fragColor = vec4(red, 0.0, 0.0, 1.0);
}`;

async function openEditor(page: import('@playwright/test').Page) {
  const b = await page.evaluate(() => (window as any).__sv.bounds().code);
  await page.mouse.click((b.left + b.right) / 2, (b.top + b.bottom) / 2);
  await expect(page.locator('.sv-editor')).toBeVisible();
}

async function selectText(page: import('@playwright/test').Page, needle: string) {
  await page.evaluate((needle) => {
    const v = (window as any).__sv.editor.view;
    const i = v.state.doc.toString().indexOf(needle);
    v.dispatch({ selection: { anchor: i, head: i + needle.length } });
    v.focus();
  }, needle);
}

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await setSource(page, SRC);
  await pause(page);
});

test('the editor opens over the code display without covering the portal', async ({ page }) => {
  await openEditor(page);
  const ed = await page.locator('.sv-editor').boundingBox();
  const { portal } = await page.evaluate(() => (window as any).__sv.bounds());
  expect(ed!.x + ed!.width).toBeLessThanOrEqual(portal.left);
  await page.keyboard.press('Escape');
  await expect(page.locator('.sv-editor')).toBeHidden();
});

test('typing updates the portal; errors appear on the right line', async ({ page }) => {
  await openEditor(page);
  const [r0] = await sampleTarget(page);
  await selectText(page, '0.2');
  await page.keyboard.type('0.9');
  await expect.poll(async () => (await state(page)).project.source).toContain('float red = 0.9;');
  await expect.poll(async () => (await sampleTarget(page))[0]).toBeGreaterThan(r0! + 100);

  await selectText(page, 'red, 0.0');
  await page.keyboard.type('nope, 0.0');
  await expect.poll(async () => (await state(page)).compile.status).toBe('error');
  const s = await state(page);
  expect(s.compile.errors[0].line).toBe(4);
  await expect(page.locator('.cm-lintRange-error')).toHaveCount(1);
});

test('a literal becomes a knob without changing the image, and undo removes it', async ({ page }) => {
  await openEditor(page);
  await page.waitForTimeout(100);
  const before = await sampleTarget(page);
  await selectText(page, '0.2');
  await expect(page.locator('.sv-knob-button')).toContainText('redAmt');
  await page.keyboard.press(`${MOD}+k`);

  await expect.poll(async () => (await state(page)).project.knobs.length).toBe(1);
  let s = await state(page);
  expect(s.project.source).toContain('in vec2 fragCoord, in float redAmt)');
  expect(s.project.source).toContain('float red = redAmt;');
  expect(s.project.knobs[0]).toMatchObject({ param: 'redAmt', value: 0.2, min: 0, max: 0.4 });
  await expect.poll(async () => (await state(page)).compile.status).toBe('ok');
  await page.waitForTimeout(100);
  const after = await sampleTarget(page);
  expect(Math.abs(after[0]! - before[0]!)).toBeLessThan(2);

  await page.keyboard.press(`${MOD}+z`);
  await expect.poll(async () => (await state(page)).project.knobs.length).toBe(0);
  s = await state(page);
  expect(s.project.source).toBe(SRC);
});

test('ineligible literals are declined with a reason', async ({ page }) => {
  await setSource(page, `const float K = 2.0;\n${SRC}`);
  await openEditor(page);
  await selectText(page, '2.0');
  await expect(page.locator('.sv-knob-button')).toBeDisabled();
  await page.keyboard.press(`${MOD}+k`);
  await expect(page.locator('.sv-editor-hint')).toContainText('mainImage');
  expect((await state(page)).project.knobs).toHaveLength(0);
});
