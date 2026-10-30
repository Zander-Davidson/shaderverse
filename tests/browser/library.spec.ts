import { test, type Page } from '@playwright/test';
import { expect, openApp, setSource, waitFrames } from './helpers';

test.beforeEach(async ({ page }) => {
  // The library never uses a browser dialog.
  page.on('dialog', (d) => {
    throw new Error(`unexpected dialog: ${d.message()}`);
  });
  await openApp(page);
});

const confirming = (page: Page) => page.evaluate(() => (window as any).__sv.library.confirming);
const project = (page: Page) => page.evaluate(() => (window as any).__sv.store.getState().project as { name: string; source: string });
const examples = (page: Page) => page.evaluate(() => (window as any).__sv.library.actions.examples as string[]);

/** Clicks a button on the library monitor, once it is drawn. */
async function press(page: Page, id: string) {
  await waitFrames(page);
  const p = await page.evaluate((id) => (window as any).__sv.libraryPoint(id), id);
  expect(p, `button ${id}`).not.toBeNull();
  await page.mouse.click(p.x, p.y);
}

async function edit(page: Page) {
  const { source } = await project(page);
  const edited = `${source}\n// edited`;
  await setSource(page, edited);
  return edited;
}

test('an example loads at once when the project has no edits', async ({ page }) => {
  const names = await examples(page);
  await press(page, 'ex:3');
  await expect.poll(async () => (await project(page)).name).toBe(names[3]);
  expect(await confirming(page)).toBeNull();
});

test('with edits, the library monitor asks first; CANCEL keeps the project and LOAD replaces it', async ({ page }) => {
  const names = await examples(page);
  const edited = await edit(page);

  await press(page, 'ex:3');
  await expect.poll(() => confirming(page)).toBe(3);
  expect((await project(page)).source).toBe(edited);

  // Another example (its number key; the list is off screen) changes the question in place.
  await page.keyboard.press('3');
  await expect.poll(() => confirming(page)).toBe(2);

  await press(page, 'cancel');
  await expect.poll(() => confirming(page)).toBeNull();
  expect((await project(page)).source).toBe(edited);

  await press(page, 'ex:3');
  await expect.poll(() => confirming(page)).toBe(3);
  await press(page, 'load');
  await expect.poll(async () => (await project(page)).name).toBe(names[3]);
  expect(await confirming(page)).toBeNull();
});

test('↓ PROJECT FIRST downloads the project and stays on the question', async ({ page }) => {
  await edit(page);
  await press(page, 'ex:1');
  await expect.poll(() => confirming(page)).toBe(1);
  const download = page.waitForEvent('download');
  await press(page, 'save');
  expect((await download).suggestedFilename()).toMatch(/\.shaderverse\.json$/);
  expect(await confirming(page)).toBe(1);
});

test('number keys ask too; Escape cancels and Enter loads', async ({ page }) => {
  const names = await examples(page);
  const edited = await edit(page);
  await page.keyboard.press('3');
  await expect.poll(() => confirming(page)).toBe(2);
  await page.keyboard.press('Escape');
  await expect.poll(() => confirming(page)).toBeNull();
  expect((await project(page)).source).toBe(edited);

  // The same example again cancels.
  await page.keyboard.press('3');
  await expect.poll(() => confirming(page)).toBe(2);
  await page.keyboard.press('3');
  await expect.poll(() => confirming(page)).toBeNull();

  await page.keyboard.press('3');
  await expect.poll(() => confirming(page)).toBe(2);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await project(page)).name).toBe(names[2]);
  // Enter went to the question, not the editor.
  expect(await page.evaluate(() => (window as any).__sv.editor.isOpen)).toBe(false);
});
