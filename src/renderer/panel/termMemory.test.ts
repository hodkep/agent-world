import { describe, expect, it } from 'vitest'
import { openOf, readOpen, saveOpen, setOpen } from './termMemory'

describe('which workspace has its terminals shown', () => {
  it('shows the drawer in the workspace that had it open and not in another, and a workspace never seen starts with it closed', () => {
    let m = readOpen(null)
    expect(openOf(m, '/shop')).toBe(false)
    m = setOpen(m, '/shop', true)
    expect(openOf(m, '/shop')).toBe(true)
    expect(openOf(m, '/blog')).toBe(false)
    m = setOpen(m, '/blog', true)
    m = setOpen(m, '/shop', false)
    expect([openOf(m, '/shop'), openOf(m, '/blog')]).toEqual([false, true])
  })

  it('is kept after a restart, for each workspace', () => {
    const m = setOpen(setOpen(readOpen(null), '/shop', true), '/blog', false)
    const again = readOpen(saveOpen(m))
    expect([openOf(again, '/shop'), openOf(again, '/blog')]).toEqual([true, false])
  })

  it('reads nothing it cannot read as closed, and ignores anything that is not a yes or a no', () => {
    expect(openOf(readOpen('{not json'), '/shop')).toBe(false)
    expect(openOf(readOpen('[1,2]'), '/shop')).toBe(false)
    expect(openOf(readOpen(JSON.stringify({ '/shop': 'yes', '/blog': true })), '/shop')).toBe(false)
    expect(openOf(readOpen(JSON.stringify({ '/shop': 'yes', '/blog': true })), '/blog')).toBe(true)
  })
})
