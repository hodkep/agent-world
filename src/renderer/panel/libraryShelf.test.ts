import { describe, expect, it } from 'vitest'
import { highlightOpening, spineLook, tierOf } from './libraryShelf'

describe('tierOf', () => {
  const rules = [
    { id: 'a', mode: 'always', when: '', strength: 'soft' },
    { id: 'b', mode: 'on-demand', when: 'x', strength: 'soft' },
    { id: 'c', mode: 'step', when: '', strength: 'soft' },
    { id: 'd', mode: 'off', when: '', strength: 'soft' }
  ] as const
  it('puts told items on the desk, pointed and step items on the shelf, the rest in the box', () => {
    expect(['a', 'b', 'c', 'd', 'e'].map((id) => tierOf([...rules], id))).toEqual(['desk', 'shelf', 'shelf', 'box', 'box'])
  })
})

describe('spineLook', () => {
  const item = (name: string, body: number) => ({ name, tokens: { description: 20, body } })
  it('is the same for the same name and taller for a longer item', () => {
    expect(spineLook(item('tdd', 100))).toEqual(spineLook(item('tdd', 100)))
    expect(spineLook(item('tdd', 3000)).height).toBeGreaterThan(spineLook(item('tdd', 100)).height)
  })
  it('stays inside the shelf', () => {
    expect(spineLook(item('x', 1e6)).height).toBeLessThanOrEqual(116)
  })
})

describe('highlightOpening', () => {
  it('marks the told names and the when-lines, and leaves the rest', () => {
    const parts = highlightOpening('- Terse: Talk short.\n- fixing a bug: tdd', ['Terse'], ['fixing a bug'])
    expect(parts).toEqual([
      { text: '- ' },
      { text: 'Terse', kind: 'told' },
      { text: ': Talk short.\n- ' },
      { text: 'fixing a bug', kind: 'when' },
      { text: ': tdd' }
    ])
  })
  it('returns the text whole when there is nothing to mark', () => {
    expect(highlightOpening('plain', [], [])).toEqual([{ text: 'plain' }])
  })
})
