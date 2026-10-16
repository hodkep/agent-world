import { describe, expect, it } from 'vitest'
import { SPRITE } from './glyphs'

describe('the agent\'s figure', () => {
  it('has 8 columns and its own four tones: hair, skin, shirt, legs', () => {
    expect(SPRITE.length).toBeGreaterThanOrEqual(9)
    for (const r of SPRITE) expect(r).toMatch(/^[.HSBL]{8}$/)
    for (const tone of 'HSBL') expect(SPRITE.join('').includes(tone), tone).toBe(true)
  })
})
