import { describe, expect, it } from 'vitest'
import { createReadings } from './readings'

const req = (at: number, output: number) => ({ kind: 'request' as const, at, turn: 't', v: { output } })
const spec = { id: 'out', kind: 'request', of: ['output'], op: 'sum', over: 'last:20' }

describe("an agent's readings", () => {
  it('give a figure for each series asked, per agent', () => {
    const r = createReadings()
    r.add('a', [req(1, 5), req(2, 7)])
    r.add('b', [req(1, 100)])
    expect(r.values('a', [spec], 10)).toEqual({ out: 12 })
    expect(r.values('b', [spec], 10)).toEqual({ out: 100 })
    expect(r.values('nobody', [spec], 10)).toEqual({ out: null })
  })

  it('keep only the latest 500, so they do not grow without end', () => {
    const r = createReadings()
    r.add('a', Array.from({ length: 700 }, (_, i) => req(i, 1)))
    expect(r.values('a', [{ ...spec, of: [], op: 'count', over: 'last:500' }], 1000)).toEqual({ out: 500 })
  })

  it('answer nothing for a series that is not valid, rather than throw', () => {
    expect(createReadings().values('a', [{ id: 'x', kind: 'request', of: ['prompt'], op: 'sum', over: 'turn' }], 1)).toEqual({})
    expect(createReadings().values('a', 'no', 1)).toEqual({})
  })

  it('forget an agent that was removed', () => {
    const r = createReadings()
    r.add('a', [req(1, 5)])
    r.forget('a')
    expect(r.values('a', [spec], 10)).toEqual({ out: null })
  })
})
