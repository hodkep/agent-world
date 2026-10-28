import { describe, expect, it } from 'vitest'
import { checkSeries, computeSeries, type Reading, type SeriesSpec } from './readings'

const req = (at: number, v: Record<string, number>, turn = 't1'): Reading => ({ kind: 'request', at, turn, v })
const tool = (at: number, name: string, durationMs: number, failed: 0 | 1, turn = 't1'): Reading => ({ kind: 'tool', at, turn, tool: name, v: { durationMs, failed } })
const spec = (s: Partial<SeriesSpec>): SeriesSpec => ({ id: 'x', kind: 'request', of: ['input'], op: 'sum', over: 'last:20', ...s })

describe('a reading a widget asks for', () => {
  const rs = [req(1000, { input: 2, cacheRead: 80, cacheWrite: 18, durationMs: 1000 }), req(2000, { input: 2, cacheRead: 90, cacheWrite: 8, durationMs: 3000 })]

  it('is a ratio of two sums: cache hit rate is what came from the cache over everything read', () => {
    expect(computeSeries(rs, spec({ of: ['cacheRead'], op: 'ratio', per: ['input', 'cacheRead', 'cacheWrite'] }), 3000)).toBeCloseTo(170 / 200)
  })

  it('can be a sum, an average, a maximum, the last value or a count', () => {
    expect(computeSeries(rs, spec({ of: ['durationMs'], op: 'sum' }), 3000)).toBe(4000)
    expect(computeSeries(rs, spec({ of: ['durationMs'], op: 'avg' }), 3000)).toBe(2000)
    expect(computeSeries(rs, spec({ of: ['durationMs'], op: 'max' }), 3000)).toBe(3000)
    expect(computeSeries(rs, spec({ of: ['durationMs'], op: 'last' }), 3000)).toBe(3000)
    expect(computeSeries(rs, spec({ of: [], op: 'count' }), 3000)).toBe(2)
  })

  it('is null, never zero, when nothing reports it; a count of nothing is zero', () => {
    expect(computeSeries(rs, spec({ of: ['firstTokenMs'], op: 'avg' }), 3000)).toBeNull()
    expect(computeSeries([], spec({ of: ['input'], op: 'sum' }), 3000)).toBeNull()
    expect(computeSeries([], spec({ of: [], op: 'count' }), 3000)).toBe(0)
    expect(computeSeries(rs, spec({ of: ['cacheRead'], op: 'ratio', per: ['firstTokenMs'] }), 3000)).toBeNull()
  })

  it('looks at the last N, or at the last minutes, or at the latest prompt', () => {
    expect(computeSeries(rs, spec({ of: ['durationMs'], op: 'sum', over: 'last:1' }), 3000)).toBe(3000)
    expect(computeSeries(rs, spec({ of: ['durationMs'], op: 'sum', over: 'mins:1' }), 62_000)).toBe(3000)
    const two = [...rs, req(5000, { durationMs: 7 }, 't2')]
    expect(computeSeries(two, spec({ of: ['durationMs'], op: 'sum', over: 'turn' }), 6000)).toBe(7)
  })

  it('counts tool calls of one tool, and the ones that failed', () => {
    const t = [tool(1, 'Bash', 700, 0), tool(2, 'Bash', 4100, 1), tool(3, 'Read', 20, 0), req(4, { input: 1 })]
    expect(computeSeries(t, spec({ kind: 'tool', of: [], op: 'count' }), 5)).toBe(3)
    expect(computeSeries(t, spec({ kind: 'tool', tool: 'Bash', of: [], op: 'count' }), 5)).toBe(2)
    expect(computeSeries(t, spec({ kind: 'tool', of: ['failed'], op: 'sum' }), 5)).toBe(1)
    expect(computeSeries(t, spec({ kind: 'tool', of: ['durationMs'], op: 'max' }), 5)).toBe(4100)
  })
})

describe('what an agent may write as a series', () => {
  const ok = { id: 'hit', kind: 'request', of: ['cacheRead'], op: 'ratio', per: ['input', 'cacheRead'], over: 'last:20' }

  it('takes a good one and fills the defaults', () => {
    expect(checkSeries([ok]).problems).toEqual([])
    expect(checkSeries([ok]).series[0]).toMatchObject({ id: 'hit', op: 'ratio' })
    expect(checkSeries(undefined)).toEqual({ series: [], problems: [] })
  })

  it('refuses a field that is not in the catalog, an unknown op, a bad window and a ratio with no per', () => {
    expect(checkSeries([{ ...ok, of: ['prompt'] }]).problems[0]).toMatch(/prompt/)
    expect(checkSeries([{ ...ok, op: 'eval' }]).problems[0]).toMatch(/op/)
    expect(checkSeries([{ ...ok, over: 'last:0' }]).problems[0]).toMatch(/over/)
    expect(checkSeries([{ ...ok, over: 'mins:99999' }]).problems[0]).toMatch(/over/)
    expect(checkSeries([{ ...ok, per: undefined }]).problems[0]).toMatch(/per/)
    expect(checkSeries([{ ...ok, kind: 'tool' }]).problems[0]).toMatch(/cacheRead/)
  })

  it('refuses a bad id, a repeated id, and more than 8', () => {
    expect(checkSeries([{ ...ok, id: 'Hit Rate' }]).problems[0]).toMatch(/id/)
    expect(checkSeries([ok, ok]).problems[0]).toMatch(/twice/)
    expect(checkSeries(Array.from({ length: 9 }, (_, i) => ({ ...ok, id: `s${i}` }))).problems[0]).toMatch(/8/)
  })
})
