import { describe, expect, it } from 'vitest'
import { SWATCH_DEFAULT, swatchOf } from './lookSwatch'

describe('the colours of a look picture', () => {
  it('are the system colours when the look sets none', () => {
    expect(swatchOf('')).toEqual(SWATCH_DEFAULT)
    expect(swatchOf('.a { color: red }')).toEqual(SWATCH_DEFAULT)
  })

  it('come from the colours the look sets on the variables the picture uses', () => {
    expect(swatchOf(':root { --bg: #101820; --accent: #e07aa8; --other: #fff }')).toEqual({ ...SWATCH_DEFAULT, bg: '#101820', accent: '#e07aa8' })
    expect(swatchOf(':root { --panel: rgb(10, 20, 30); --paper: hsl(30 40% 90%) }')).toMatchObject({ panel: 'rgb(10, 20, 30)', paper: 'hsl(30 40% 90%)' })
  })

  it('take the last one set, and ignore anything that is not a plain colour', () => {
    expect(swatchOf(':root { --accent: #111111 } .x { --accent: #222222 }').accent).toBe('#222222')
    expect(swatchOf(':root { --accent: var(--x) }').accent).toBe(SWATCH_DEFAULT.accent)
    expect(swatchOf(':root { --accent: red; background: url(x) }').accent).toBe(SWATCH_DEFAULT.accent)
    expect(swatchOf(':root { --bg: #12345 }').bg).toBe(SWATCH_DEFAULT.bg)
  })
})
