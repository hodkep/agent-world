import { describe, expect, it } from 'vitest'
import { closeTab, openTab, type TabState } from './tabs'

const s = (open: string[], active: string | null): TabState => ({ open, active })

describe('openTab', () => {
  it('adds a file as a new tab at the end and makes it the active one', () => {
    expect(openTab(s(['a', 'b'], 'a'), 'c')).toEqual(s(['a', 'b', 'c'], 'c'))
  })

  it('switches to a file that is already open instead of opening it twice', () => {
    expect(openTab(s(['a', 'b'], 'a'), 'b')).toEqual(s(['a', 'b'], 'b'))
  })

  it('starts the first tab from nothing', () => {
    expect(openTab(s([], null), 'a')).toEqual(s(['a'], 'a'))
  })
})

describe('closeTab', () => {
  it('leaves the active tab alone when another one is closed', () => {
    expect(closeTab(s(['a', 'b', 'c'], 'c'), 'a')).toEqual(s(['b', 'c'], 'c'))
  })

  it('moves to the tab on the right when the active one is closed', () => {
    expect(closeTab(s(['a', 'b', 'c'], 'b'), 'b')).toEqual(s(['a', 'c'], 'c'))
  })

  it('moves to the tab on the left when the active one was last', () => {
    expect(closeTab(s(['a', 'b', 'c'], 'c'), 'c')).toEqual(s(['a', 'b'], 'b'))
  })

  it('leaves nothing active when the only tab is closed', () => {
    expect(closeTab(s(['a'], 'a'), 'a')).toEqual(s([], null))
  })

  it('ignores a tab that is not open', () => {
    expect(closeTab(s(['a'], 'a'), 'z')).toEqual(s(['a'], 'a'))
  })
})
