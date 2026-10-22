import { describe, expect, it } from 'vitest'
import { qrMatrix } from './qr'

const LINK = 'https://claude.ai/code/session_01AbCdEfGhIjKlMnOpQrStUv'

describe('qrMatrix', () => {
  it('draws the three finder squares and picks the smallest version that holds the text', () => {
    const m = qrMatrix('hello')
    expect(m.length).toBe(21) // version 1
    for (const [x, y] of [[0, 0], [14, 0], [0, 14]] as const) {
      expect(m[y]![x]).toBe(true)
      expect(m[y + 3]![x + 3]).toBe(true)
      expect(m[y + 1]![x + 1]).toBe(false)
    }
    expect(qrMatrix(LINK).length).toBe(33) // version 4
  })

  it('refuses text that does not fit instead of drawing a code that cannot be read', () => {
    expect(() => qrMatrix('x'.repeat(135))).toThrow(/too long/)
  })

  // A scanner read this one back as LINK (decoded with Core Image when the encoder was written): it fails if the encoding changes.
  it('draws the same code for the same text', () => {
    const rows = qrMatrix(LINK).map((r) => r.map((c) => (c ? '#' : '.')).join(''))
    const sum = rows.join('').split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
    expect(sum).toBe(GOLDEN)
  })
})
const GOLDEN = 1415454014
