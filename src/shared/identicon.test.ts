import { describe, expect, it } from 'vitest'
import { IDENTICON_COLORS, identicon } from './identicon'

describe('the small pixel picture made from a name', () => {
  it('is the same every time for the same name', () => {
    expect(identicon('agent-world')).toEqual(identicon('agent-world'))
  })
  it('is a 5 by 5 grid, mirrored left to right, with a colour from the palette', () => {
    const { cells, color } = identicon('student-internship-program')
    expect(cells).toHaveLength(25)
    for (let y = 0; y < 5; y++) for (let x = 0; x < 2; x++) expect(cells[y * 5 + x]).toBe(cells[y * 5 + 4 - x])
    expect(IDENTICON_COLORS).toContain(color)
  })
  it('always has some cells on, and differs between names', () => {
    const names = ['agent-world', 'mahait', 'act3-web-app', 'notes', 'payments-api', 'docs-site', 'charlie', 'delta', 'os', 'ada', 'x', '']
    for (const n of names) expect(identicon(n).cells.filter(Boolean).length).toBeGreaterThanOrEqual(6)
    const seen = new Set(names.map((n) => identicon(n).cells.join('')))
    expect(seen.size).toBeGreaterThanOrEqual(names.length - 1)
  })
  it('does not depend on case or the spaces around a name', () => {
    expect(identicon('  Delta ')).toEqual(identicon('delta'))
  })
})
