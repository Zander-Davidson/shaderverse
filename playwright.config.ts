import { createHash } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';

// Locally the tests render on the real GPU (Metal on macOS), where a frame
// takes milliseconds. In CI, or with PW_SOFTWARE_GL=1, WebGL runs on
// SwiftShader (CPU), where a full cockpit frame takes about a second, so
// there is only one worker to keep them from starving each other.
const software = !!process.env.CI || !!process.env.PW_SOFTWARE_GL;
const gpuArgs = software
  ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  : process.platform === 'darwin'
    ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']
    : ['--enable-gpu', '--ignore-gpu-blocklist'];

// Each checkout serves its build on its own port, so a preview server left
// running in another worktree is never reused by mistake.
const port = 4200 + (parseInt(createHash('sha1').update(import.meta.dirname).digest('hex').slice(0, 6), 16) % 700);
const baseURL = `http://localhost:${port}`;

// Small enough to keep software rendering cheap; the layout fits any 16:9.
const viewport = { width: 960, height: 540 };

export default defineConfig({
  testDir: 'tests/browser',
  // The first page in each worker pays for shader compiles and the shell bake.
  timeout: software ? 90_000 : 60_000,
  workers: software ? 1 : 2,
  expect: { timeout: 10_000 },
  use: { baseURL, viewport },
  webServer: {
    command: `npm run build && npx vite preview --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport, launchOptions: { args: gpuArgs } },
    },
  ],
});
