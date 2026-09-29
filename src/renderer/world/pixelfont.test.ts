import { describe, expect, it } from 'vitest'
import { GLYPHS, textPixels } from './pixelfont'

describe('pixel font', () => {
  it('every glyph is 5 tall with rows of one width (3, or 5 for wide letters)', () => {
    for (const [ch, rows] of Object.entries(GLYPHS)) {
      expect(rows, ch).toHaveLength(5)
      const w = rows[0]!.length
      expect([3, 5], ch).toContain(w)
      for (const r of rows) expect(r, `${ch}: "${r}"`).toHaveLength(w)
    }
  })

  it('m, n and w are distinct from each other and from h', () => {
    const shapes = ['m', 'n', 'w', 'h'].map((c) => GLYPHS[c]!.join('|'))
    expect(new Set(shapes).size).toBe(4)
    expect(GLYPHS.m![0]!.length).toBe(5)
    expect(GLYPHS.w![0]!.length).toBe(5)
  })

  it('covers letters, digits and the separators agent names use', () => {
    for (const ch of 'abcdefghijklmnopqrstuvwxyz0123456789-_.') expect(GLYPHS[ch], ch).toBeDefined()
  })

  it('lays glyphs out with a 1px gap and no trailing gap, case-insensitive', () => {
    const rows = textPixels('Ab')
    expect(rows).toHaveLength(5)
    expect(rows[0]).toHaveLength(7)
    expect(textPixels('am')[0]).toHaveLength(9)
    expect(textPixels('AB')).toEqual(textPixels('ab'))
  })

  it('renders unknown characters as blanks instead of failing', () => {
    expect(textPixels('a☃')[0]).toHaveLength(7)
    expect(textPixels('')).toEqual(['', '', '', '', ''])
  })
})
