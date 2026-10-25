import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/browser',
  // WebGL runs on SwiftShader (CPU), so the cockpit renders slowly; keep
  // workers few so they don't starve each other.
  timeout: 60_000,
  workers: 2,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1600, height: 900 },
  },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1600, height: 900 },
        launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
      },
    },
  ],
});
