import { describe, expect, it } from 'vitest'
import { cleanRates, estimateUsd, normalizeModel, rateFor } from './prices'

describe('price estimates', () => {
  it('matches a model however a program spells it', () => {
    expect(normalizeModel('Claude Sonnet 4.6 (Thinking)')).toBe('claudesonnet46')
    expect(rateFor('claude-sonnet-4-6')).toEqual({ in: 3, out: 15 })
    expect(rateFor('Claude Opus 4.6 (Thinking)')).toEqual({ in: 5, out: 25 })
  })
  it('prices tokens read and written per million', () => {
    expect(estimateUsd('claude-sonnet-4-6', 1_000_000, 100_000)).toBeCloseTo(4.5)
  })
  it('leaves a model without a rate unpriced, and lets the user add one', () => {
    expect(estimateUsd('Gemini 3.8 Flash (High)', 1000, 1000)).toBeNull()
    expect(estimateUsd('Gemini 3.8 Flash (High)', 1_000_000, 1_000_000, { 'gemini-3.8-flash': { in: 0.5, out: 2 } })).toBeCloseTo(2.5)
  })
  it('the user\'s own rate beats the built-in one, and the most specific name wins', () => {
    expect(rateFor('claude-sonnet-4-6', { 'claude-sonnet-4-6': { in: 1, out: 2 } })).toEqual({ in: 1, out: 2 })
    expect(rateFor('gemini-3.1-pro-high', { 'gemini-3.1': { in: 1, out: 1 }, 'gemini-3.1-pro': { in: 2, out: 2 } })).toEqual({ in: 2, out: 2 })
  })
  it('keeps only well-formed rates from a hand-edited file', () => {
    expect(cleanRates({ a: { in: 1, out: 2 }, b: { in: 'x', out: 2 }, c: { in: -1, out: 1 }, d: 4 })).toEqual({ a: { in: 1, out: 2 } })
    expect(cleanRates('junk')).toEqual({})
  })
})
