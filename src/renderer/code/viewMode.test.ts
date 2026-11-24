import { describe, expect, it } from 'vitest'
import { toggled } from './viewMode'

describe('a file read as formatted text instead of source', () => {
  it('turns a file on, then off again', () => {
    const on = toggled(new Set(), 'a.md')
    expect([...on]).toEqual(['a.md'])
    expect([...toggled(on, 'a.md')]).toEqual([])
  })

  it('leaves the others as they were, and does not change the set it was given', () => {
    const was = new Set(['a.md'])
    expect([...toggled(was, 'b.md')].sort()).toEqual(['a.md', 'b.md'])
    expect([...was]).toEqual(['a.md'])
  })
})
