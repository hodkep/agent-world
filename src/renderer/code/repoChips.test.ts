import { describe, expect, it } from 'vitest'
import { chipsOf, pickRepo } from './repoChips'

const r = (...names: string[]) => names.map((name) => ({ name, branch: 'main', dirty: 0 }))
const names = (x: { name: string }[]) => x.map((y) => y.name)

describe('which repositories get a chip', () => {
  it('shows both of up to two, with no menu', () => {
    const c = chipsOf(r('a', 'b'), 'a')
    expect(names(c.shown)).toEqual(['a', 'b'])
    expect(c.more).toEqual([])
  })
  it('puts the rest behind the menu past two', () => {
    const c = chipsOf(r('a', 'b', 'c', 'd', 'e', 'f'), 'b')
    expect(names(c.shown)).toEqual(['a', 'b'])
    expect(names(c.more)).toEqual(['c', 'd', 'e', 'f'])
  })
  it('keeps the picked repository in the row, in place of the last chip, when it came from the menu', () => {
    const c = chipsOf(r('a', 'b', 'c', 'd', 'e', 'f'), 'f')
    expect(names(c.shown)).toEqual(['a', 'f'])
    expect(names(c.more)).toEqual(['b', 'c', 'd', 'e'])
  })
})

describe('which repository is picked', () => {
  it('is the remembered one while it is still there, else the first', () => {
    expect(pickRepo(r('a', 'b'), 'b')).toBe('b')
    expect(pickRepo(r('a', 'b'), 'gone')).toBe('a')
    expect(pickRepo(r('a', 'b'), null)).toBe('a')
    expect(pickRepo([], 'a')).toBeNull()
  })
})
