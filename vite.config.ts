import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths, so the build works from any subpath (GitHub Pages
  // serves project sites from /<repo>/).
  base: './',
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
