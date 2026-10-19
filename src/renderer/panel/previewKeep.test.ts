import { describe, expect, it } from 'vitest'
import { PREVIEWS_KEPT, keepPreviews } from './previewKeep'

describe('which Previews stay loaded behind the one on screen', () => {
  it('keeps the last few opened, the newest last, and lets the oldest go', () => {
    let list: string[] = []
    for (const id of ['a', 'b', 'c', 'd']) list = keepPreviews(list, id, () => false)
    expect(list).toEqual(['b', 'c', 'd'])
    expect(PREVIEWS_KEPT).toBe(3)
  })
  it('opening one that is kept again only moves it to the end', () => {
    expect(keepPreviews(['a', 'b', 'c'], 'a', () => false)).toEqual(['b', 'c', 'a'])
  })
  it('lets go of an agent that has gone to sleep, but never the one being opened', () => {
    expect(keepPreviews(['a', 'b'], 'c', (id) => id === 'a')).toEqual(['b', 'c'])
    expect(keepPreviews(['a'], 'b', () => true)).toEqual(['b'])
  })
})
