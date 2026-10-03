import { describe, expect, it } from 'vitest'
import { WindowWorkspaces } from './windowWorkspaces'

describe('WindowWorkspaces', () => {
  it('starts every window without a project, so a fresh window shows the picker', () => {
    const w = new WindowWorkspaces()
    expect(w.get(1)).toBeNull()
    expect(w.get(2)).toBeNull()
  })

  it('remembers each window\'s own choice', () => {
    const w = new WindowWorkspaces()
    w.set(1, '/a')
    w.set(2, '/b')
    expect(w.get(1)).toBe('/a')
    expect(w.get(2)).toBe('/b')
  })

  it('forgets a window that closed', () => {
    const w = new WindowWorkspaces()
    w.set(1, '/a')
    w.drop(1)
    expect(w.get(1)).toBeNull()
  })

  it('sends windows showing a forgotten project back to the picker, and leaves the others', () => {
    const w = new WindowWorkspaces()
    w.set(1, '/a')
    w.set(2, '/b')
    w.set(3, '/a')
    w.forget('/a')
    expect([w.get(1), w.get(2), w.get(3)]).toEqual([null, '/b', null])
  })

  it('lists the windows showing a project, so a notification can open the right one', () => {
    const w = new WindowWorkspaces()
    w.set(1, '/a')
    w.set(2, '/b')
    w.set(3, '/a')
    expect(w.showing('/a')).toEqual([1, 3])
    expect(w.showing('/none')).toEqual([])
  })
})
