import { describe, expect, it } from 'vitest'
import { ICONS, characterPixels, paletteFor } from './sprites'

const ROLES = ['boss', 'senior', 'intern'] as const
const VIEWS = ['front', 'back', 'side'] as const
const POSES = ['stand', 'walk1', 'walk2', 'sit'] as const
const has = (rows: string[], ch: string) => rows.some((r) => r.includes(ch))

describe('character pixels', () => {
  it('every role/view/pose/hair combination is 16x24', () => {
    for (const role of ROLES)
      for (const view of VIEWS)
        for (const pose of POSES)
          for (const key of ['a', 'b', 'c', 'd', 'e', 'f']) {
            const rows = characterPixels(key, role, view, pose)
            expect(rows, `${role}/${view}/${pose}/${key}`).toHaveLength(24)
            for (const r of rows) expect(r, `${role}/${view}/${pose}/${key}: "${r}"`).toHaveLength(16)
          }
  })

  it('faces show eyes from the front and side, never from the back', () => {
    expect(has(characterPixels('ada', 'senior', 'front', 'stand'), 'e')).toBe(true)
    expect(has(characterPixels('ada', 'senior', 'side', 'stand'), 'e')).toBe(true)
    expect(has(characterPixels('ada', 'senior', 'back', 'stand'), 'e')).toBe(false)
  })

  it('roles are readable from every side: boss crown, intern cap', () => {
    for (const view of VIEWS) {
      expect(has(characterPixels('x', 'boss', view, 'stand'), 'g'), view).toBe(true)
      expect(has(characterPixels('x', 'intern', view, 'stand'), 'A'), view).toBe(true)
      expect(has(characterPixels('x', 'senior', view, 'stand'), 'g'), view).toBe(false)
    }
  })

  it('sitting seen from behind hides the legs behind the stool', () => {
    expect(has(characterPixels('ada', 'senior', 'back', 'sit').slice(18), 'k')).toBe(false)
    expect(has(characterPixels('ada', 'senior', 'back', 'stand').slice(18), 'k')).toBe(true)
  })

  it('walk frames move the legs', () => {
    const stand = characterPixels('ada', 'senior', 'front', 'stand')
    expect(characterPixels('ada', 'senior', 'front', 'walk1').slice(19)).not.toEqual(stand.slice(19))
    expect(characterPixels('ada', 'senior', 'side', 'walk1').slice(19)).not.toEqual(characterPixels('ada', 'senior', 'side', 'stand').slice(19))
  })
})

describe('icons and palette', () => {
  it('every icon is 7x5', () => {
    for (const [name, rows] of Object.entries(ICONS)) {
      expect(rows, name).toHaveLength(5)
      for (const r of rows) expect(r, `${name}: "${r}"`).toHaveLength(7)
    }
  })

  it('palette is stable per key so agents keep their look', () => {
    expect(paletteFor('ada', 'senior')).toEqual(paletteFor('ada', 'senior'))
    expect(paletteFor('ada', 'senior')).not.toEqual(paletteFor('linus', 'senior'))
  })
})
