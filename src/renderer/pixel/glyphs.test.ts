import { describe, expect, it } from 'vitest'
import type { StampKind } from '../chat/officeCalls'
import { GLYPHS, type GlyphName, SPRITE } from './glyphs'

describe('the pixel pictures', () => {
  it('are 7 by 7, drawn only in the colour, the light tone and the ink, and show something', () => {
    for (const [name, rows] of Object.entries(GLYPHS)) {
      expect(rows, name).toHaveLength(7)
      for (const r of rows) expect(r, name).toMatch(/^[.Xok]{7}$/)
      expect(rows.join('').includes('X'), name).toBe(true)
    }
  })

  it('give the note, drawn in the paper colour, ink detail, so it is not a plain square', () => {
    expect(GLYPHS.note.join('').includes('k')).toBe(true)
  })

  it('include one for every kind of stamp the chat draws, and the ones the track and the tiles use', () => {
    const stamps: StampKind[] = ['library', 'todo', 'note', 'flag', 'plan']
    const names: GlyphName[] = [...stamps, 'check', 'review', 'land', 'cross']
    for (const n of names) expect(GLYPHS[n], n).toBeDefined()
  })

  it('give the agent a sprite of 8 columns and its own five tones', () => {
    expect(SPRITE.length).toBeGreaterThanOrEqual(9)
    for (const r of SPRITE) expect(r).toMatch(/^[.HSBL]{8}$/)
  })
})
