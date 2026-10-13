import { defineConfig } from '@playwright/test'

// Real programs, real accounts, real usage: never part of the normal run. One at a time, no retries, long waits.
//   WALK_SHOTS=<folder> npx playwright test -c playwright.real.config.ts real/builder.real.ts
export default defineConfig({ testDir: 'real', testMatch: '*.real.ts', timeout: 50 * 60_000, workers: 1, retries: 0, globalSetup: './test-support/tmpRun.ts' })
