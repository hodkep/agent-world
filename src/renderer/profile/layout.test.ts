import { describe, expect, it } from 'vitest'
import { CARD_COMPACT, CARD_FULL, cardLayout } from './layout'
import { agoLabel, agoShort, durationLabel, levelOf } from './format'

describe('where the profile card goes', () => {
  const stage = { w: 1000, h: 700 }
  it('opens on the side of the stage away from the agent you clicked, so it never covers them', () => {
    expect(cardLayout({ ...stage, agentX: 200 })).toMatchObject({ mode: 'full', side: 'right' })
    expect(cardLayout({ ...stage, agentX: 800 })).toMatchObject({ mode: 'full', side: 'left' })
    expect(cardLayout({ ...stage, agentX: 500 }).side).toBe('left')
  })

  it('shrinks to the compact card when the window is narrower, and into the panel when there is too little room', () => {
    expect(cardLayout({ w: 760, h: 700, agentX: 100 }).mode).toBe('compact')
    expect(cardLayout({ w: 560, h: 700, agentX: 100 }).mode).toBe('panel')
  })

  it('goes into the panel when the stage is too short for the card, rather than cover the office', () => {
    expect(cardLayout({ w: 1000, h: CARD_FULL.h + 10, agentX: 100 }).mode).toBe('compact')
    expect(cardLayout({ w: 1000, h: CARD_COMPACT.h, agentX: 100 }).mode).toBe('panel')
  })

  it('shows the compact card on a roomy stage when that is what was asked for', () => {
    expect(cardLayout({ ...stage, agentX: 100, prefer: 'compact' })).toMatchObject({ mode: 'compact', size: CARD_COMPACT })
  })

  it('shows the full card on a stage that only had room for the compact one, when that is what was asked for', () => {
    expect(cardLayout({ w: 760, h: 700, agentX: 100, prefer: 'full' })).toMatchObject({ mode: 'full', size: CARD_FULL })
  })

  it('still uses the panel when there is no room for any overlay, whatever was asked for', () => {
    expect(cardLayout({ w: 560, h: 700, agentX: 100, prefer: 'full' }).mode).toBe('panel')
    expect(cardLayout({ w: 1000, h: CARD_COMPACT.h, agentX: 100, prefer: 'full' }).mode).toBe('panel')
  })

  it('stays in the panel when asked to', () => {
    expect(cardLayout({ ...stage, agentX: 100, panel: true }).mode).toBe('panel')
  })

  it('says how big the card is, so it can be placed', () => {
    expect(cardLayout({ ...stage, agentX: 100 }).size).toEqual(CARD_FULL)
    expect(cardLayout({ w: 760, h: 700, agentX: 100 }).size).toEqual(CARD_COMPACT)
  })
})

describe('the words on the card', () => {
  it('says how long ago in days and hours, hours and minutes, or minutes', () => {
    const now = 1_000_000_000_000
    expect([agoLabel(now - (3 * 86400 + 4 * 3600 + 5 * 60) * 1000, now), agoLabel(now - (6 * 3600 + 20 * 60) * 1000, now), agoLabel(now - 12 * 60_000, now), agoLabel(now - 20_000, now), agoLabel(null, now)]).toEqual(['3d 4h ago', '6h ago', '12m ago', 'just now', 'unknown'])
  })

  it('gives one unit for a tile', () => {
    const now = 1_000_000_000_000
    expect([agoShort(now - 20_000, now), agoShort(now - 12 * 60_000, now), agoShort(now - 6 * 3600_000, now), agoShort(now - 3 * 86400_000, now), agoShort(null, now)]).toEqual(['new', '12m', '6h', '3d', '–'])
  })

  it('writes time worked as hours and minutes, minutes, or seconds', () => {
    expect([durationLabel(72 * 60_000), durationLabel(5 * 3600_000 + 5 * 60_000), durationLabel(48 * 60_000), durationLabel(30_000), durationLabel(0)]).toEqual(['1h 12m', '5h 5m', '48m', '30s', '0s'])
  })

  it('gives a level and how far to the next, from lines changed; level 1 at the start', () => {
    expect(levelOf(0)).toEqual({ level: 1, pct: 0 })
    const l = levelOf(360 + 48)
    expect(l.level).toBeGreaterThanOrEqual(5)
    expect(l.pct).toBeGreaterThanOrEqual(0)
    expect(l.pct).toBeLessThan(100)
    expect(levelOf(1_000_000).level).toBeLessThanOrEqual(99)
  })
})
