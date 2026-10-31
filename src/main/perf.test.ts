import { describe, expect, it } from 'vitest'
import { StallMonitor } from './perf'

describe('noticing that the main process was busy', () => {
  it('says nothing while its ticks arrive on time', () => {
    const m = new StallMonitor({ everyMs: 50, thresholdMs: 150 })
    m.tick(1000)
    expect(m.tick(1050)).toBeNull()
    expect(m.tick(1110)).toBeNull() // 10 ms late: ordinary jitter
  })

  it('reports how late a tick was, and what ran in the stall', () => {
    const m = new StallMonitor({ everyMs: 50, thresholdMs: 150 })
    m.tick(1000)
    m.note('git:status', 1020, 40)
    m.note('chat:send', 1100, 2000) // began inside the stall and ran long
    m.note('old', 500, 5)
    const stall = m.tick(3250)
    expect(stall).toMatchObject({ lateMs: 2200, from: 1050, to: 3250 })
    expect(stall!.ran.map((r) => r.what)).toEqual(['git:status', 'chat:send'])
  })

  it('keeps only the most recent calls, so a long session does not grow the list', () => {
    const m = new StallMonitor({ everyMs: 50, thresholdMs: 150, keep: 3 })
    m.tick(0)
    for (let i = 0; i < 10; i++) m.note(`c${i}`, 100 + i, 1)
    expect(m.tick(1000)!.ran.map((r) => r.what)).toEqual(['c7', 'c8', 'c9'])
  })
})
