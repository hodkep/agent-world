import { linkSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { measure } from './sizes'

let dir: string
beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), 'aw-size-'))))
afterEach(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))

describe('what a folder takes on disk', () => {
  it('adds up its files, hidden ones too, counts a hard-linked file once, and does not follow a link out of the folder', async () => {
    const s = join(dir, 'skill')
    mkdirSync(join(s, 'media'), { recursive: true })
    mkdirSync(join(s, '.venv'), { recursive: true })
    writeFileSync(join(s, 'SKILL.md'), 'x'.repeat(100))
    writeFileSync(join(s, 'media', 'a.bin'), 'x'.repeat(1000))
    writeFileSync(join(s, '.venv', 'b.bin'), 'x'.repeat(10))
    linkSync(join(s, 'media', 'a.bin'), join(s, 'media', 'a-again.bin'))
    writeFileSync(join(dir, 'outside.bin'), 'x'.repeat(5000))
    symlinkSync(join(dir, 'outside.bin'), join(s, 'outside.bin'))
    expect(await measure(s)).toBe(1110)
    expect(await measure(join(dir, 'nope'))).toBe(0)
  })
})
