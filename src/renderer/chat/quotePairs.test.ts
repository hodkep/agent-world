import { describe, expect, it } from 'vitest'
import { pairQuotes } from './quotePairs'

describe('a message with quotes, as pairs of a quote and the words written under it', () => {
  it('is one piece of plain words when nothing is quoted', () => {
    expect(pairQuotes('why these?')).toEqual([{ kind: 'free', text: 'why these?' }])
    expect(pairQuotes('')).toEqual([])
  })

  it('pairs each quote with the note under it', () => {
    const text = '> README.md\n\nplease check this one\n\n> IntroVideo.tsx, introFilm.ts\n\nwe can drop these'
    expect(pairQuotes(text)).toEqual([
      { kind: 'qa', quote: 'README.md', note: 'please check this one' },
      { kind: 'qa', quote: 'IntroVideo.tsx, introFilm.ts', note: 'we can drop these' }
    ])
  })

  it('keeps a quote with no note, and quotes that follow each other, as pairs with an empty note', () => {
    expect(pairQuotes('> one\n\n> two\n\nabout two')).toEqual([
      { kind: 'qa', quote: 'one', note: '' },
      { kind: 'qa', quote: 'two', note: 'about two' }
    ])
  })

  it('joins a quote that runs over several lines, and a note that does', () => {
    expect(pairQuotes('> line one\n> line two\n\nnote a\nnote b')).toEqual([{ kind: 'qa', quote: 'line one\nline two', note: 'note a\nnote b' }])
  })

  it('leaves words written before the first quote as plain words ahead of the pairs', () => {
    expect(pairQuotes('look at this\n\n> a\n\nwhy?')).toEqual([
      { kind: 'free', text: 'look at this' },
      { kind: 'qa', quote: 'a', note: 'why?' }
    ])
  })

  it('keeps the note and the message typed after it apart: the note is the first paragraph, the rest is the message', () => {
    expect(pairQuotes("> Charlie's Stop bug: not fixed.\n\nignore\n\ncommit and merge to main")).toEqual([
      { kind: 'qa', quote: "Charlie's Stop bug: not fixed.", note: 'ignore' },
      { kind: 'free', text: 'commit and merge to main' }
    ])
    expect(pairQuotes('> a\n\nnote\n\nline one\nline two\n\nline three')).toEqual([
      { kind: 'qa', quote: 'a', note: 'note' },
      { kind: 'free', text: 'line one\nline two\n\nline three' }
    ])
  })

  it('still gives the words straight under a quote to that quote when a later quote follows', () => {
    expect(pairQuotes('> a\n\nabout a\n\n> b\n\nabout b\n\nand then this')).toEqual([
      { kind: 'qa', quote: 'a', note: 'about a' },
      { kind: 'qa', quote: 'b', note: 'about b' },
      { kind: 'free', text: 'and then this' }
    ])
  })
})
