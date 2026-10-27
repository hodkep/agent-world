import { describe, expect, it } from 'vitest'
import { STAMP_ICON } from './stampIcons'

describe('the picture on each kind of stamp', () => {
  it('is the chat\'s own icon for it, a different one for each kind, so the stamps are told apart by shape as well as by colour', () => {
    expect(Object.keys(STAMP_ICON).sort()).toEqual(['flag', 'library', 'look', 'note', 'plan', 'todo'])
    expect(new Set(Object.values(STAMP_ICON)).size).toBe(6)
  })
})
