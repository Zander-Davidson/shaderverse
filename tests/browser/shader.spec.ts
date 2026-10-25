import { test } from '@playwright/test';
import { expect, openApp, sampleTarget, setSource, state } from './helpers';

const GOOD = `void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
    fragColor = vec4(1.0, 0.0, 0.0, 1.0);
}`;

test.beforeEach(async ({ page }) => openApp(page));

test('a pasted Shadertoy shader compiles and renders', async ({ page }) => {
  await setSource(page, GOOD);
  const s = await state(page);
  expect(s.compile.status).toBe('ok');
  await page.waitForTimeout(100);
  const [r, g, b] = await sampleTarget(page);
  expect(r).toBeGreaterThan(250);
  expect(g).toBeLessThan(5);
  expect(b).toBeLessThan(5);
});

test('compile errors report user line numbers and keep the last good program', async ({ page }) => {
  await setSource(page, GOOD);
  const before = (await state(page)).compileCount;
  const bad = GOOD.replace('fragColor = vec4', 'float x = undefinedThing;\n    fragColor = vec4');
  await setSource(page, bad);
  const s = await state(page);
  expect(s.compile.status).toBe('error');
  expect(s.compile.errors[0]).toMatchObject({ line: 3 });
  expect(s.compile.errors[0].message).toContain('undefinedThing');
  expect(s.compileCount).toBe(before);
  const [r] = await sampleTarget(page);
  expect(r).toBeGreaterThan(250); // still the red shader
});

test('a missing mainImage is a general error', async ({ page }) => {
  await setSource(page, 'void main() {}');
  const s = await state(page);
  expect(s.compile.status).toBe('error');
  expect(s.compile.errors[0].line).toBeNull();
});

test('standard uniforms are available', async ({ page }) => {
  await setSource(
    page,
    `void mainImage(out vec4 o, in vec2 c) {
       o = vec4(c / iResolution.xy, fract(iTime + iTimeDelta + float(iFrame) + iDate.w + iMouse.x), 1.0);
     }`,
  );
  expect((await state(page)).compile.status).toBe('ok');
  const [r] = await sampleTarget(page, 0.9, 0.5, 4);
  expect(r).toBeGreaterThan(200);
});
