import { defineConfig } from 'vitest/config'

// The real-agent pilot (pilot/*.pilot.ts) is never part of the normal test run: it starts real programs and spends real usage.
export default defineConfig({ test: { include: ['pilot/**/*.pilot.ts'], testTimeout: 40 * 60_000, hookTimeout: 120_000, globalSetup: ['./test-support/tmpRun.ts'], fileParallelism: false } })
