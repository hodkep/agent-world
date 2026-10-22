import { describe, expect, it } from 'vitest'
import { bossSees } from './bossSees'

describe('whether the office boy sees the supervisor coming', () => {
  const boy = { x: 24, y: 5 }
  it('sees him when he faces his way, within six tiles', () => {
    expect(bossSees(boy, 'right', { x: 29, y: 5 })).toBe('sees')
    expect(bossSees(boy, 'right', { x: 28, y: 8 })).toBe('sees')
    expect(bossSees(boy, 'up', { x: 24, y: 2 })).toBe('sees')
  })

  it('does not see him with his back to him: he is behind the boy', () => {
    expect(bossSees(boy, 'right', { x: 20, y: 5 })).toBe('behind')
    expect(bossSees(boy, 'right', { x: 19, y: 7 })).toBe('behind')
    expect(bossSees(boy, 'down', { x: 24, y: 2 })).toBe('behind')
  })

  it('a boss at his side is seen from the corner of the eye', () => {
    expect(bossSees(boy, 'right', { x: 24, y: 8 })).toBe('sees')
  })

  it('knows nothing of a boss farther than six tiles, in either direction', () => {
    expect(bossSees(boy, 'right', { x: 18, y: 5 })).toBe('behind')
    expect(bossSees(boy, 'right', { x: 17, y: 5 })).toBe('out')
    expect(bossSees(boy, 'right', { x: 31, y: 5 })).toBe('out')
  })
})
