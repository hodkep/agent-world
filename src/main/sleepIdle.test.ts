import { describe, expect, it } from 'vitest'
import { quietSince, sleepBlocker, sleepIdle, type SleepDeps } from './sleepIdle'

const MIN = 60_000
const NOW = 10_000 * MIN

/** One agent that has been idle for 40 minutes, with nothing holding it awake; each test changes one thing. */
function world(over: Partial<SleepDeps> = {}) {
  const slept: string[] = []
  const deps: SleepDeps = {
    ids: ['a'],
    activity: () => 'idle',
    quietSince: () => NOW - 40 * MIN,
    hasChildren: () => false,
    pending: () => 0,
    inRun: () => false,
    procs: async () => 0,
    sleep: (id) => void slept.push(id),
    now: NOW,
    after: 30 * MIN,
    ...over,
  }
  return { deps, slept }
}

describe('putting idle agents to sleep', () => {
  it('sleeps an agent that has been idle for longer than the limit', async () => {
    const { deps, slept } = world()
    expect(await sleepIdle(deps)).toEqual(['a'])
    expect(slept).toEqual(['a'])
  })

  it('leaves one that went quiet less than the limit ago', async () => {
    const { deps, slept } = world({ quietSince: () => NOW - 29 * MIN })
    await sleepIdle(deps)
    expect(slept).toEqual([])
  })

  it('leaves one that is working, waiting for an answer, or already asleep', async () => {
    for (const act of ['thinking', 'running', 'waiting', 'permission', 'asleep'] as const) {
      const { deps, slept } = world({ activity: () => act })
      await sleepIdle(deps)
      expect(slept, String(act)).toEqual([])
    }
  })

  it('treats an agent that has taken no turn since it was started as idle, as the roster does', async () => {
    const { deps, slept } = world({ activity: () => undefined })
    await sleepIdle(deps)
    expect(slept).toEqual(['a'])
  })

  it('leaves one whose subagents are running, or that has a message waiting for it', async () => {
    for (const over of [{ hasChildren: () => true }, { pending: () => 1 }]) {
      const { deps, slept } = world(over)
      await sleepIdle(deps)
      expect(slept).toEqual([])
    }
  })

  it('leaves one that is in the middle of a workflow run, whose approvals and gates are sent to it', async () => {
    const { deps, slept } = world({ inRun: () => true })
    await sleepIdle(deps)
    expect(slept).toEqual([])
  })

  it('looks again after finding its commands, and leaves one that became busy meanwhile', async () => {
    let busy = false
    const { deps, slept } = world({ activity: () => (busy ? 'thinking' : 'idle'), procs: async () => ((busy = true), 0) })
    await sleepIdle(deps)
    expect(slept).toEqual([])
  })

  it('leaves one that has a command still running, such as a dev server, since sleeping would stop it', async () => {
    const { deps, slept } = world({ procs: async () => 1 })
    await sleepIdle(deps)
    expect(slept).toEqual([])
  })

  it('does nothing when the limit is 0 (switched off)', async () => {
    const { deps, slept } = world({ after: 0 })
    expect(await sleepIdle(deps)).toEqual([])
    expect(slept).toEqual([])
  })

  it('sleeps only the agents that are due', async () => {
    const { deps, slept } = world({ ids: ['a', 'b', 'c'], quietSince: (id) => NOW - (id === 'b' ? 5 : 90) * MIN })
    await sleepIdle(deps)
    expect(slept).toEqual(['a', 'c'])
  })
})

describe('quietSince', () => {
  it('is the latest of its work, its start and the last typing, so a redraw of the terminal is not activity', () => {
    expect(quietSince({ busy: 5, spawned: 9, typed: 7 })).toBe(9)
    expect(quietSince({ busy: 12, spawned: 9 })).toBe(12)
    expect(quietSince({ spawned: 3, typed: 8 })).toBe(8)
    expect(quietSince({})).toBe(0)
  })
})

describe('sleepBlocker (Put to sleep, on demand)', () => {
  it('is empty for an idle agent with nothing depending on it, however recent its work', async () => {
    expect(await sleepBlocker(world({ quietSince: () => NOW }).deps, 'a')).toBe('')
  })

  it('says why not for each thing that holds an agent up', async () => {
    expect(await sleepBlocker(world({ activity: () => 'thinking' }).deps, 'a')).toMatch(/finishes its turn/)
    expect(await sleepBlocker(world({ activity: () => 'waiting' }).deps, 'a')).toMatch(/waiting for you/)
    expect(await sleepBlocker(world({ hasChildren: () => true }).deps, 'a')).toMatch(/agents working for it/)
    expect(await sleepBlocker(world({ pending: () => 2 }).deps, 'a')).toMatch(/message/)
    expect(await sleepBlocker(world({ inRun: () => true }).deps, 'a')).toMatch(/workflow/)
    expect(await sleepBlocker(world({ procs: async () => 1 }).deps, 'a')).toMatch(/command/)
  })
})
