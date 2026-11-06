import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { skipHold } from './skipNotes'

describe('steps the person skips one after another', () => {
  beforeEach(() => void vi.useFakeTimers())
  afterEach(() => void vi.useRealTimers())

  it('are told once, after the last, with every name and the notes written', () => {
    const told: unknown[][] = []
    const hold = skipHold((...a) => void told.push(a), 2000)
    hold('r1', 'Commit', 'commit')
    vi.advanceTimersByTime(1500)
    hold('r1', 'Push', 'push', 'not needed')
    vi.advanceTimersByTime(1500)
    hold('r1', 'Pull request', 'pr')
    expect(told).toEqual([])
    vi.advanceTimersByTime(2000)
    expect(told).toEqual([['r1', ['Commit', 'Push', 'Pull request'], 'pr', 'not needed']])
  })

  it('are told apart when they are far apart, and a run does not wait for another\'s', () => {
    const told: unknown[][] = []
    const hold = skipHold((...a) => void told.push(a), 2000)
    hold('r1', 'Commit', 'commit')
    hold('r2', 'Build', 'build')
    vi.advanceTimersByTime(2500)
    hold('r1', 'Push', 'push')
    vi.advanceTimersByTime(2500)
    expect(told).toEqual([['r1', ['Commit'], 'commit', undefined], ['r2', ['Build'], 'build', undefined], ['r1', ['Push'], 'push', undefined]])
  })
})
