import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBatcher } from './batch'

describe('doing many small updates together', () => {
  beforeEach(() => void vi.useFakeTimers())
  afterEach(() => void vi.useRealTimers())

  it('holds what is queued and runs all of it together, in order, once the wait is over', () => {
    const ran: number[] = []
    const later = createBatcher(150)
    later(() => ran.push(1))
    later(() => ran.push(2))
    later(() => ran.push(3))
    expect(ran).toEqual([])
    vi.advanceTimersByTime(149)
    expect(ran).toEqual([])
    vi.advanceTimersByTime(1)
    expect(ran).toEqual([1, 2, 3])
  })

  it('starts a new wait for what comes after a batch ran', () => {
    const ran: string[] = []
    const later = createBatcher(100)
    later(() => ran.push('a'))
    vi.advanceTimersByTime(100)
    later(() => ran.push('b'))
    expect(ran).toEqual(['a'])
    vi.advanceTimersByTime(100)
    expect(ran).toEqual(['a', 'b'])
  })

  it('waits from the first update, not the last, so a steady stream is still shown every wait', () => {
    const ran: number[] = []
    const later = createBatcher(100)
    for (let i = 0; i < 10; i++) {
      later(() => ran.push(i))
      vi.advanceTimersByTime(20)
    }
    expect(ran.length).toBeGreaterThanOrEqual(5)
    expect(ran.slice(0, 5)).toEqual([0, 1, 2, 3, 4])
  })

  it('can run what is waiting at once, and drop it when stopped', () => {
    const ran: number[] = []
    const later = createBatcher(100)
    later(() => ran.push(1))
    later.flush()
    expect(ran).toEqual([1])
    later(() => ran.push(2))
    later.stop()
    vi.advanceTimersByTime(500)
    expect(ran).toEqual([1])
  })
})
