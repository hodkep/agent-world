import { describe, expect, it } from 'vitest'
import { effortsFor, fitOptions, modelOf } from './efforts'

const claude = [{ value: '', label: 'Default' }, { value: 'opus', label: 'Opus' }]
const agy = [
  { value: '', label: 'Default model', efforts: [] },
  { value: 'gemini-3.8-flash-high', label: 'Gemini 3.8 Flash (High)', efforts: [] },
  { value: 'gemini-3.8-flash-low', label: 'Gemini 3.8 Flash (Low)', efforts: [] }
]

describe('thinking levels per program', () => {
  it('offers every level where a program lists none per model, and none where it lists none at all', () => {
    expect(effortsFor(claude, 'opus')).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
    expect(effortsFor(agy, 'gemini-3.8-flash-high')).toEqual([])
  })
  it('finds the listed variant from the name and level in the footer', () => {
    expect(modelOf(agy, undefined, 'Gemini 3.8 Flash', 'low')?.value).toBe('gemini-3.8-flash-low')
    expect(modelOf(agy, undefined, 'Gemini 3.8 Flash', 'high')?.value).toBe('gemini-3.8-flash-high')
  })
  it('drops a model or level a program cannot take', () => {
    expect(fitOptions(agy, { model: 'opus', effort: 'high', permissionMode: 'plan' })).toEqual({ permissionMode: 'plan' })
    expect(fitOptions(agy, { model: 'gemini-3.8-flash-low', effort: 'high' })).toEqual({ model: 'gemini-3.8-flash-low' })
    expect(fitOptions(claude, { model: 'opus', effort: 'max' })).toEqual({ model: 'opus', effort: 'max' })
  })
})
