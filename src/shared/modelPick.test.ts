import { describe, expect, it } from 'vitest'
import { parsePick, pickValue, storePick } from './modelPick'

describe('model picks grouped by program', () => {
  it('round-trips a program and its model, and reads a plain alias as Claude', () => {
    expect(parsePick(pickValue('agy', 'gemini-3.8-flash-high'))).toEqual({ provider: 'agy', model: 'gemini-3.8-flash-high' })
    expect(parsePick('opus')).toEqual({ provider: 'claude', model: 'opus' })
    expect(parsePick('claude|')).toEqual({ provider: 'claude', model: '' })
  })
  it('keeps Claude jobs as they were saved and names the program for any other', () => {
    expect(storePick('claude', 'haiku')).toBe('haiku')
    expect(storePick('agy', 'gpt-oss-120b-medium')).toBe('agy|gpt-oss-120b-medium')
    expect(storePick('agy', '')).toBe('')
  })
})
