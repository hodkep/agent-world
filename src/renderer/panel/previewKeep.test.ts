import { describe, expect, it } from 'vitest'
import { PREVIEWS_KEPT, keepPreviews } from './previewKeep'

describe('which Previews stay loaded behind the one on screen', () => {
  it('keeps the last few opened, the newest last, and lets the oldest go', () => {
    let list: string[] = []
    for (const id of ['a', 'b', 'c', 'd']) list = keepPreviews(list, id)
    expect(list).toEqual(['b', 'c', 'd'])
    expect(PREVIEWS_KEPT).toBe(3)
  })
  it('opening one that is kept again only moves it to the end', () => {
    expect(keepPreviews(['a', 'b', 'c'], 'a')).toEqual(['b', 'c', 'a'])
  })
  it("keeps the page of an agent that is asleep as well: its page is the person's, whether or not its program runs", () => {
    expect(keepPreviews(['a', 'b'], 'c')).toEqual(['a', 'b', 'c'])
  })
})
