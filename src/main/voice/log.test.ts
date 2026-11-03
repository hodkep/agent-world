import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { talkLog } from './log'

const file = () => join(mkdtempSync(join(tmpdir(), 'aw-voicelog-')), 'voice.log')

describe('the talk log', () => {
  it('blots out a key that came with an error text', () => {
    const f = file()
    talkLog(f)('error wss://x/?key=AIzaSyD3x4mpleK7QxAAAAAAAAAAAAAA refused')
    expect(readFileSync(f, 'utf8')).not.toMatch(/AIzaSy/)
  })
  it('adds a line with the time to the end of the file', () => {
    const f = file()
    const log = talkLog(f, () => new Date('2026-11-03T10:00:00Z').getTime())
    log('start shop')
    log('state listening')
    expect(readFileSync(f, 'utf8')).toBe('2026-11-03T10:00:00.000Z start shop\n2026-11-03T10:00:00.000Z state listening\n')
  })
  it('keeps to a size, dropping the oldest lines first', () => {
    const f = file()
    const log = talkLog(f, () => 0, 2000)
    for (let i = 0; i < 200; i++) log(`line ${i} ${'x'.repeat(40)}`)
    expect(statSync(f).size).toBeLessThanOrEqual(2000)
    expect(readFileSync(f, 'utf8')).toContain('line 199')
    expect(readFileSync(f, 'utf8')).not.toContain('line 0 ')
  })
  it('never throws, even when the file cannot be written', () => {
    expect(() => talkLog('/nonexistent-dir-xyz/voice.log', () => 0)('start')).not.toThrow()
  })
})
