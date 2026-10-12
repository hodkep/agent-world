import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: ['./test-support/tmpRun.ts'],
    // Worker threads end with the process that started them. Forked workers do not: one left behind by a killed run spun at full CPU for 16 hours.
    pool: 'threads',
    testTimeout: 15_000,
    hookTimeout: 15_000,
    teardownTimeout: 5_000
  }
})
