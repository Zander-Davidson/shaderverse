import { test, type Page } from '@playwright/test';
import { expect, MOD, openApp, pause, sampleTarget, setSource, state } from './helpers';

const SRC = `void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
    float red = 0.2;
    fragColor = vec4(red, 0.0, 0.0, 1.0);
}`;

/** Screen point of the character at `needle` (plus `offset`) on the curved code panel. */
async function codePoint(page: Page, needle: string, offset = 0) {
  return page.evaluate(
    ({ needle, offset }) => {
      const sv = (window as any).__sv;
      const i = sv.store.getState().project.source.indexOf(needle);
      return sv.codePoint(i + offset);
    },
    { needle, offset },
  );
}

const selection = (page: Page) =>
  page.evaluate(() => {
    const v = (window as any).__sv.editor.view;
    const r = v.state.selection.main;
    return { text: v.state.sliceDoc(r.from, r.to), head: r.head, focused: v.hasFocus };
  });

test.describe('in-scene editor', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await setSource(page, SRC);
    await pause(page);
  });

  test('clicking the curved code places the caret there and takes keyboard focus', async ({ page }) => {
    // Just left of the middle of "=": the caret goes before it.
    const p = await codePoint(page, 'red = 0.2', 4);
    await page.mouse.click(p.x - 1.5, p.y);
    await expect.poll(async () => (await state(page)).ui.editorOpen).toBe(true);
    const s = await selection(page);
    expect(s.focused).toBe(true);
    expect(s.head).toBe(SRC.indexOf('red = 0.2') + 4);
    await expect(page.locator('.sv-editor')).toHaveCount(0); // no flat window
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await state(page)).ui.editorOpen).toBe(false);
  });

  test('typing updates the portal; errors appear on the right line', async ({ page }) => {
    const [r0] = await sampleTarget(page);
    const p = await codePoint(page, '0.2;', 1);
    await page.mouse.dblclick(p.x, p.y);
    await expect.poll(async () => (await selection(page)).text).toBe('0.2');
    await page.keyboard.type('0.9');
    await expect.poll(async () => (await state(page)).project.source).toContain('float red = 0.9;');
    await expect.poll(async () => (await sampleTarget(page))[0]).toBeGreaterThan(r0! + 100);

    await page.keyboard.press('End');
    await page.keyboard.type(' oops');
    await expect.poll(async () => (await state(page)).compile.status).toBe('error');
    expect((await state(page)).compile.errors[0].line).toBe(3);
  });

  test('dragging selects; a literal becomes a knob, and undo removes it', async ({ page }) => {
    const before = await sampleTarget(page);
    const a = await codePoint(page, '0.2;', 0);
    const b = await codePoint(page, '0.2;', 3);
    // Drag from the start of "0.2" to the start of ";".
    await page.mouse.move(a.x - 6, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x - 6, b.y, { steps: 5 });
    await page.mouse.up();
    await expect.poll(async () => (await selection(page)).text).toBe('0.2');

    await page.keyboard.press(`${MOD}+k`);
    await expect.poll(async () => (await state(page)).project.knobs.length).toBe(1);
    const s = await state(page);
    expect(s.project.source).toContain('in vec2 fragCoord, in float redAmt)');
    expect(s.project.knobs[0]).toMatchObject({ param: 'redAmt', value: 0.2 });
    await expect.poll(async () => (await state(page)).compile.status).toBe('ok');
    await page.waitForTimeout(100);
    expect(Math.abs((await sampleTarget(page))[0]! - before[0]!)).toBeLessThan(2);

    await page.keyboard.press(`${MOD}+z`);
    await expect.poll(async () => (await state(page)).project.knobs.length).toBe(0);
    expect((await state(page)).project.source).toBe(SRC);
  });

  test('ineligible literals are declined with a reason', async ({ page }) => {
    await setSource(page, `const float K = 2.0;\n${SRC}`);
    const p = await codePoint(page, '2.0', 1);
    await page.mouse.dblclick(p.x, p.y);
    await expect.poll(async () => (await selection(page)).text).toBe('2.0');
    await page.keyboard.press(`${MOD}+k`);
    await expect
      .poll(() => page.evaluate(() => (window as any).__sv.editor.session.hint.text))
      .toContain('mainImage');
    expect((await state(page)).project.knobs).toHaveLength(0);
  });

  test('global shortcuts are suspended while typing', async ({ page }) => {
    const p = await codePoint(page, 'red = 0.2');
    await page.mouse.click(p.x, p.y);
    await page.keyboard.type(' ');
    expect((await state(page)).project.playback.playing).toBe(false); // Space typed, not toggled
  });
});

test('the overlay editor is still available and never covers the portal', async ({ page }) => {
  await page.goto('/?noboot&gfx=low&editor=overlay');
  await page.waitForFunction(() => (window as any).__sv?.store.getState().compile.status === 'ok');
  const b = await page.evaluate(() => (window as any).__sv.bounds().code);
  await page.mouse.click(b.left + 200, (b.top + b.bottom) / 2);
  await expect(page.locator('.sv-editor')).toBeVisible();
  const ed = await page.locator('.sv-editor').boundingBox();
  const { portal } = await page.evaluate(() => (window as any).__sv.bounds());
  expect(ed!.x + ed!.width).toBeLessThanOrEqual(portal.left);
  await page.keyboard.press('Escape');
  await expect(page.locator('.sv-editor')).toBeHidden();
});
