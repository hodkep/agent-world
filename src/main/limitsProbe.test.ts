import { describe, expect, it } from 'vitest'
import { LIMITS_FRESH_MS, needsProbe } from './limitsProbe'

describe('asking a program for its limits (each ask starts the whole program and its MCP servers)', () => {
  const now = 1_000_000_000
  it('is skipped for a login whose agents reported lately, since they already say where it stands', () => {
    expect(needsProbe({ live: true, reportedAt: now - 60_000, forced: false, now })).toBe(false)
  })
  it('is made for a login nobody reported for, or not for a long while', () => {
    expect(needsProbe({ live: true, reportedAt: undefined, forced: false, now })).toBe(true)
    expect(needsProbe({ live: true, reportedAt: now - LIMITS_FRESH_MS - 1, forced: false, now })).toBe(true)
  })
  it('is made for a program whose agents never report, whatever it knows', () => {
    expect(needsProbe({ live: false, reportedAt: now, forced: false, now })).toBe(true)
  })
  it('is made when the person asked for a refresh', () => {
    expect(needsProbe({ live: true, reportedAt: now, forced: true, now })).toBe(true)
  })
  it('waits 15 minutes between background asks', () => {
    expect(LIMITS_FRESH_MS).toBe(15 * 60_000)
  })
})
