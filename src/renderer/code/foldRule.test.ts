import { describe, expect, it } from 'vitest'
import { CONTEXTS, CONTEXT_KEY, DEFAULT_FOLD, FOLD_KEY, foldOptions, readFold } from './foldRule'

const saved = (o: Record<string, string>) => (key: string) => o[key] ?? null

describe('what is saved of the fold choice', () => {
  it('folds with 3 lines of context when nothing was saved', () => {
    expect(readFold(saved({}))).toEqual({ fold: true, context: 3 })
    expect(DEFAULT_FOLD).toEqual({ fold: true, context: 3 })
  })
  it('reads Show and each of the three context sizes', () => {
    expect(readFold(saved({ [FOLD_KEY]: 'show' })).fold).toBe(false)
    expect(readFold(saved({ [FOLD_KEY]: 'fold' })).fold).toBe(true)
    expect(CONTEXTS).toEqual([3, 5, 10])
    for (const c of CONTEXTS) expect(readFold(saved({ [CONTEXT_KEY]: String(c) })).context).toBe(c)
  })
  it('falls back to the default for anything else, a size that is not offered included', () => {
    expect(readFold(saved({ [FOLD_KEY]: 'maybe', [CONTEXT_KEY]: '7' }))).toEqual(DEFAULT_FOLD)
    expect(readFold(saved({ [CONTEXT_KEY]: 'ten' })).context).toBe(3)
  })
  it('falls back to the default when storage cannot be read', () => {
    expect(readFold(() => { throw new Error('blocked') })).toEqual(DEFAULT_FOLD)
  })
})

describe('what the diff editor is told', () => {
  it('hides unchanged regions with the chosen context while folding', () => {
    expect(foldOptions({ fold: true, context: 5 })).toEqual({ hideUnchangedRegions: { enabled: true, contextLineCount: 5 } })
  })
  it('shows everything for Show, and keeps the context ready for the next fold', () => {
    expect(foldOptions({ fold: false, context: 10 })).toEqual({ hideUnchangedRegions: { enabled: false, contextLineCount: 10 } })
  })
})
