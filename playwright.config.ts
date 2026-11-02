import { defineConfig } from '@playwright/test';
const evidence = process.env.HARNESS_EVIDENCE || '.harness/browser';
export default defineConfig({
  testDir: './tests/browser', fullyParallel: false, workers: 1, retries: 0,
  outputDir: `${evidence}/browser-artifacts`,
  reporter: [['list'], ['json', { outputFile: `${evidence}/browser-results.json` }]],
  use: { baseURL: 'http://127.0.0.1:4321', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'tablet', use: { viewport: { width: 820, height: 1180 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: { cwd: '.harness/browser-site', command: 'node node_modules/astro/bin/astro.mjs preview --host 127.0.0.1 --port 4321', url: 'http://127.0.0.1:4321', reuseExistingServer: false, timeout: 30000, env: { ASTRO_TELEMETRY_DISABLED: '1' } },
});
