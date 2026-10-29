import { describe, expect, it } from 'vitest'
import { DEFAULT_CATALOG, cleanCatalog, mergeCatalog } from './runnerCatalog'

describe('the runner catalog', () => {
  it('lists the models with a score from public benchmarks, and none that has no score', () => {
    const haiku = DEFAULT_CATALOG.find((m) => m.model === 'claude-haiku-5-5')
    expect(haiku).toMatchObject({ program: 'claude', alias: 'haiku', n: 2 })
    expect(haiku!.score).toBeGreaterThan(0.7)
    expect(DEFAULT_CATALOG.every((m) => m.score !== undefined && m.n)).toBe(true)
  })
  it('keeps only well-formed entries from a hand-edited file', () => {
    const raw = [{ model: 'gemini-4-argon', program: 'agy', cost: 0.88, score: 0.9, n: 2 }, { model: 'x' }, { model: 'y', program: 'nope', cost: 1 }, 'junk', { model: 'z', program: 'claude', cost: -1 }, { model: 'new-one', program: 'claude', cost: 0.5 }]
    expect(cleanCatalog(raw).map((m) => m.model)).toEqual(['gemini-4-argon', 'new-one'])
    expect(cleanCatalog('nonsense')).toEqual([])
  })
  it('lets the user\'s entry replace the built-in one of the same model and add new ones, which stay unscored until scored', () => {
    const merged = mergeCatalog([{ model: 'claude-haiku-5-5', program: 'claude', cost: 0.06, score: 0.5, n: 1 }, { model: 'new-one', program: 'claude', cost: 0.1 }])
    expect(merged.find((m) => m.model === 'claude-haiku-5-5')).toMatchObject({ cost: 0.06, score: 0.5 })
    expect(merged.find((m) => m.model === 'new-one')!.score).toBeUndefined()
    expect(merged.length).toBe(DEFAULT_CATALOG.length + 1)
  })
})
