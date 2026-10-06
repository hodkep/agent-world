import { describe, expect, it } from 'vitest'
import { back, fresh, newer, older, onFirstLine, onLastLine } from './historyNav'

const sent = ['third', 'second', 'first']

describe('walking back through what was sent', () => {
  it('goes to older messages, saving the draft on the first step, and stops at the oldest', () => {
    const a = older(fresh, sent, 'half a thou')!
    expect(a).toEqual({ recall: { index: 0, draft: 'half a thou' }, text: 'third' })
    const b = older(a.recall, sent, 'third')!
    expect(b).toEqual({ recall: { index: 1, draft: 'half a thou' }, text: 'second' })
    const c = older(b.recall, sent, 'second')!
    expect(older(c.recall, sent, 'first')).toBeNull()
    expect(older(fresh, [], 'x')).toBeNull()
  })
  it('comes forward again and ends on the draft, not lost', () => {
    const at2 = { index: 2, draft: 'my draft' }
    const a = newer(at2, sent)!
    expect(a).toEqual({ recall: { index: 1, draft: 'my draft' }, text: 'second' })
    const b = newer(newer(a.recall, sent)!.recall, sent)!
    expect(b).toEqual({ recall: fresh, text: 'my draft' })
    expect(newer(fresh, sent)).toBeNull()
  })
  it('keeps the first draft however far it goes and however a recalled message was edited in between', () => {
    const a = older(fresh, sent, 'draft')!
    const b = older(a.recall, sent, 'third, edited')!
    expect(b.recall.draft).toBe('draft')
  })
  it('Esc returns to the draft at once', () => {
    expect(back({ index: 1, draft: 'mine' })).toEqual({ recall: fresh, text: 'mine' })
    expect(back(fresh)).toBeNull()
  })
  it('only moves when the caret is on the first line (up) or the last (down)', () => {
    expect(onFirstLine('one\ntwo', 2)).toBe(true)
    expect(onFirstLine('one\ntwo', 5)).toBe(false)
    expect(onLastLine('one\ntwo', 5)).toBe(true)
    expect(onLastLine('one\ntwo', 1)).toBe(false)
    expect(onFirstLine('', 0) && onLastLine('', 0)).toBe(true)
  })
})
