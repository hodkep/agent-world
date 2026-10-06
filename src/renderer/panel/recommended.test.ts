import { describe, expect, it } from 'vitest'
import { splitRecommended } from './recommended'

describe('the Recommended mark on an option', () => {
  it('takes a trailing "(Recommended)" out of the title so it can be shown as a badge', () => {
    expect(splitRecommended('Portal picks, state-wide (Recommended)')).toEqual({ title: 'Portal picks, state-wide', recommended: true })
    expect(splitRecommended('Yes (recommended) ')).toEqual({ title: 'Yes', recommended: true })
  })
  it('leaves every other title alone', () => {
    expect(splitRecommended('Two choices up front')).toEqual({ title: 'Two choices up front', recommended: false })
    expect(splitRecommended('Recommended settings')).toEqual({ title: 'Recommended settings', recommended: false })
    expect(splitRecommended('(Recommended)')).toEqual({ title: '(Recommended)', recommended: false })
  })
})
