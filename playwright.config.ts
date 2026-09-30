import { defineConfig } from '@playwright/test'

// Each test launches its own Electron app and PTYs; too many at once starve each other and time out.
export default defineConfig({ testDir: 'e2e', testMatch: '*.e2e.ts', timeout: 60_000, workers: 4 })
