import { defineConfig } from '@playwright/test'

// Each test launches its own Electron app and PTYs; too many at once starve each other and time out.
// On GitHub's macOS runner (3 cores) three apps at once are too many: specs that pass alone fail in different places from run to run, so CI runs two.
// A spec gets one retry. One that only passes on the retry is listed as flaky in the run's summary (scripts/ci-summary.mjs), which a second retry would hide.
const CI = !!process.env.CI
export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.e2e.ts',
  timeout: 60_000,
  workers: CI ? 2 : 3,
  retries: 1,
  // The json report goes where PLAYWRIGHT_JSON_OUTPUT_NAME says; the summary reads it.
  reporter: CI ? [['list'], ['json']] : 'list',
  globalSetup: './test-support/tmpRun.ts'
})
