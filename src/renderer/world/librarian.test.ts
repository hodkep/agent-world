import { describe, expect, it } from 'vitest'
import { LibrarianDesk, beatSteps, besideShelf, freshItems, libraryMarks, shelfSlot } from './librarian'
import type { Step } from './staff'

const stand = { x: 13, y: 3 }
const walks = (s: Step[]) => s.flatMap((x) => (x.kind === 'walk' ? [x.to] : []))
const waits = (s: Step[]) => s.filter((x): x is Extract<Step, { kind: 'wait' }> => x.kind === 'wait')

describe('what the librarian does next', () => {
  it('serves the most useful thing first: a book for an agent, then a new book to shelve, the ledger, a failing tool, a shush, dusting last', () => {
    const d = new LibrarianDesk()
    d.want({ kind: 'dust', at: { x: 3, y: 2 } }, 0)
    d.want({ kind: 'shush' }, 0)
    d.want({ kind: 'tap' }, 0)
    d.want({ kind: 'ledger' }, 0)
    d.want({ kind: 'shelve', at: { x: 15, y: 2 } }, 0)
    d.want({ kind: 'fetch', at: { x: 4, y: 2 } }, 0)
    expect([1, 2, 3, 4, 5, 6].map(() => d.next(100)?.kind)).toEqual(['fetch', 'shelve', 'ledger', 'tap', 'shush', 'dust'])
    expect(d.next(100)).toBeNull()
  })

  it('lets a book go when the agent has finished reading before she is free', () => {
    const d = new LibrarianDesk()
    d.want({ kind: 'fetch', at: { x: 4, y: 2 } }, 0)
    expect(d.next(5000)).toBeNull()
  })

  it('marks the ledger at most once in twenty seconds and taps a failing tool at most once in ten minutes', () => {
    const d = new LibrarianDesk()
    d.want({ kind: 'ledger' }, 0)
    expect(d.next(0)?.kind).toBe('ledger')
    d.want({ kind: 'ledger' }, 5000)
    expect(d.next(5000)).toBeNull()
    d.want({ kind: 'ledger' }, 21_000)
    expect(d.next(21_000)?.kind).toBe('ledger')
    d.want({ kind: 'tap' }, 0)
    expect(d.next(0)?.kind).toBe('tap')
    d.want({ kind: 'tap' }, 60_000)
    expect(d.next(60_000)).toBeNull()
    d.want({ kind: 'tap' }, 601_000)
    expect(d.next(601_000)?.kind).toBe('tap')
  })

  it('forgets a wish that waited more than a minute, and keeps only a few books to shelve', () => {
    const d = new LibrarianDesk()
    d.want({ kind: 'shush' }, 0)
    expect(d.next(61_000)).toBeNull()
    for (let i = 0; i < 9; i++) d.want({ kind: 'shelve', at: { x: 15, y: 2 } }, 0)
    let n = 0
    while (d.next(10)) n++
    expect(n).toBe(3)
  })
})

describe('her steps for each beat', () => {
  it('fetches a book: walks to the reader, hands it over, waits while it is read, takes it back, and goes back to the lectern', () => {
    const s = beatSteps({ kind: 'fetch', at: { x: 15, y: 2 } }, stand)
    expect(walks(s)).toEqual([{ x: 15, y: 2 }, stand])
    expect(waits(s)[0]).toMatchObject({ prop: 'book', pose: 'hold' })
    expect(waits(s).at(-1)).toMatchObject({ face: 'up' })
  })

  it('reaches up to the rack behind the lectern to tap a failing tool, and says Shh! towards the lounge', () => {
    expect(waits(beatSteps({ kind: 'tap' }, stand))[0]).toMatchObject({ pose: 'reach', face: 'up' })
    expect(waits(beatSteps({ kind: 'shush' }, stand))[0]).toMatchObject({ say: 'Shh!', face: 'right' })
    expect(walks(beatSteps({ kind: 'ledger' }, stand))).toEqual([])
  })

  it('dusts with a cloth and shelves with a book in her hands', () => {
    expect(waits(beatSteps({ kind: 'dust', at: { x: 3, y: 2 } }, stand)).some((w) => w.prop === 'cloth' && w.pose === 'wipe')).toBe(true)
    expect(waits(beatSteps({ kind: 'shelve', at: { x: 15, y: 2 } }, stand))[0]).toMatchObject({ prop: 'book' })
  })
})

describe('where she stands at a shelf', () => {
  const floor = (p: { x: number; y: number }) => p.y === 2 && p.x !== 13 && p.x !== 17 && p.x >= 1
  it('beside the reader, on a free tile, never on the lectern', () => {
    expect(besideShelf({ x: 3, y: 2 }, floor)).toEqual({ x: 4, y: 2 })
    expect(besideShelf({ x: 16, y: 2 }, floor)).toEqual({ x: 15, y: 2 })
    expect(besideShelf({ x: 14, y: 2 }, floor)).toEqual({ x: 15, y: 2 })
  })
})

describe('the spines on the shelves', () => {
  it('puts each item on its own slot, the same every time', () => {
    expect(shelfSlot('tdd', 48)).toBe(shelfSlot('tdd', 48))
    expect(shelfSlot('tdd', 48)).toBeGreaterThanOrEqual(0)
    expect(shelfSlot('tdd', 48)).toBeLessThan(48)
  })

  it('makes the three most used glow, and dusts the ones not used in thirty days', () => {
    const use = (used: number) => ({ used })
    const m = libraryMarks(['a', 'b', 'c', 'd', 'e'], { a: use(9), b: use(4), c: use(7), d: use(1) })
    expect(m.glow).toEqual(['a', 'c', 'b'])
    expect(m.dusty).toEqual(['e'])
  })

  it('calls an item new for a day after it first shows up, but not the ones there the first time the office looked', () => {
    const first = freshItems(['a', 'b'], null, 1000)
    expect(first.fresh).toEqual([])
    const later = freshItems(['a', 'b', 'c'], first.seen, 5000)
    expect(later.fresh).toEqual(['c'])
    expect(freshItems(['a', 'b', 'c'], later.seen, 5000 + 86_400_000 + 1).fresh).toEqual([])
  })
})
