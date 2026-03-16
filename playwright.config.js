const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: 0,

  reporter: [
    // Live output in terminal
    ['list'],
    // Machine-readable results for failure-report generator
    ['json', { outputFile: 'test-results/results.json' }],
  ],

  use: {
    headless: process.env.HEADED !== '1',
    screenshot: 'only-on-failure',
    video: 'off',

    // file:// pages load CDN resources fine in Chromium (no CORS block).
    // Ignore any HTTPS errors from CDN fonts/tailwind.
    ignoreHTTPSErrors: true,

    // Give the app enough time to initialize (150ms animation + JS init)
    actionTimeout: 10_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  outputDir: 'test-results/playwright-artifacts',
});
