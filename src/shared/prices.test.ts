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
  it('prices the Gemini models agy offers, at every level, at Google\'s published rates', () => {
    const before = new Date('2026-10-06')
    for (const m of ['gemini-3.8-flash-high', 'Gemini 3.7 Flash (Low)', 'gemini-3.6-flash-medium']) expect(rateFor(m, {}, before)).toEqual({ in: 0.75, out: 3.75 })
    expect(rateFor('gemini-3.1-pro-low', {}, before)).toEqual({ in: 2, out: 12 })
  })
  it('prices the Claude 5.x models at Anthropic\'s list rates, in any spelling', () => {
    expect(rateFor('claude-haiku-5-5')).toEqual({ in: 0.1, out: 0.5 })
    expect(rateFor('Claude Sonnet 5.5')).toEqual({ in: 2, out: 10 })
    expect(rateFor('claude-opus-5-5')).toEqual({ in: 4, out: 20 })
    expect(rateFor('claude-fable-5-1')).toEqual({ in: 10, out: 50 })
  })
  it('doubles the Flash rates when the launch price ends on 1 January 2027', () => {
    expect(rateFor('gemini-3.8-flash-high', {}, new Date('2026-12-31T23:00:00Z'))).toEqual({ in: 0.75, out: 3.75 })
    expect(rateFor('gemini-3.8-flash-high', {}, new Date('2027-01-01T00:00:00Z'))).toEqual({ in: 1.5, out: 7.5 })
    expect(rateFor('gemini-3.1-pro-high', {}, new Date('2027-06-01'))).toEqual({ in: 2, out: 12 })
  })
  it('leaves a model without a rate unpriced, and lets the user add one', () => {
    expect(estimateUsd('GPT-OSS 120B (Medium)', 1000, 1000)).toBeNull()
    expect(estimateUsd('GPT-OSS 120B (Medium)', 1_000_000, 1_000_000, { 'gpt-oss-120b': { in: 0.15, out: 0.75 } })).toBeCloseTo(0.9)
  })
  it('the user\'s own rate beats the built-in one, and the most specific name wins', () => {
    expect(rateFor('claude-sonnet-4-6', { 'claude-sonnet-4-6': { in: 1, out: 2 } })).toEqual({ in: 1, out: 2 })
    expect(rateFor('gemini-3.1-pro-high', { 'gemini-3.1': { in: 1, out: 1 }, 'gemini-3.1-pro': { in: 5, out: 5 } })).toEqual({ in: 5, out: 5 })
  })
  it('keeps only well-formed rates from a hand-edited file', () => {
    expect(cleanRates({ a: { in: 1, out: 2 }, b: { in: 'x', out: 2 }, c: { in: -1, out: 1 }, d: 4 })).toEqual({ a: { in: 1, out: 2 } })
    expect(cleanRates('junk')).toEqual({})
  })
})
