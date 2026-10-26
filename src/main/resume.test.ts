import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { recentlyRunning, writeRunning } from './resume'

let dir: string
beforeEach(() => (dir = mkdtempSync(join(tmpdir(), 'aw-resume-'))))
afterEach(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))

describe('agents that were running when the app went away', () => {
  it('come back if it was only a moment ago (a restart), and not after a long time', () => {
    const file = join(dir, 'running.json')
    writeRunning(file, ['a', 'b'], 1_000_000)
    expect(recentlyRunning(file, 1_000_000 + 5_000, 20_000)).toEqual(['a', 'b'])
    expect(recentlyRunning(file, 1_000_000 + 60_000, 20_000)).toEqual([])
  })

  it('is empty when there is no record or it is damaged', () => {
    const file = join(dir, 'running.json')
    expect(recentlyRunning(file, 1, 1000)).toEqual([])
    writeFileSync(file, 'nope')
    expect(recentlyRunning(file, 1, 1000)).toEqual([])
  })
})
