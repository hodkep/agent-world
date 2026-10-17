import { defineConfig } from '@playwright/test'

// Each test launches its own Electron app and PTYs; too many at once starve each other and time out.
// On GitHub's macOS runner (3 cores) three apps at once are too many: specs that pass alone fail in different places from run to run, so CI runs two, and a spec gets a second retry.
const CI = !!process.env.CI
export default defineConfig({ testDir: 'e2e', testMatch: '*.e2e.ts', timeout: 60_000, workers: CI ? 2 : 3, retries: CI ? 2 : 1, globalSetup: './test-support/tmpRun.ts' })
