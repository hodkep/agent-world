import { describe, expect, it } from 'vitest'
import { restartWhenIdle } from './restartWhenIdle'

const wait = new Error("Error invoking remote method 'agent-reconfigure': Error: Wait until it finishes its turn.")
const sleep = () => new Promise<void>((r) => setTimeout(r, 0))

describe('restarting agents that are still finishing a turn', () => {
  it('asks again until the agent has finished, then restarts it', async () => {
    let calls = 0
    const failed = await restartWhenIdle(['a'], async () => { if (++calls < 3) throw wait }, sleep)
    expect(calls).toBe(3)
    expect(failed).toEqual([])
  })

  it('gives up after the time allowed and says which agents were not restarted', async () => {
    let calls = 0
    const failed = await restartWhenIdle(['a', 'b'], async (id) => { if (id === 'a') { calls++; throw wait } }, sleep, 4)
    expect(calls).toBe(5)
    expect(failed).toEqual(['a'])
  })

  it('does not ask again after a failure that is not "wait"', async () => {
    let calls = 0
    const failed = await restartWhenIdle(['a'], async () => { calls++; throw new Error('That agent is not running.') }, sleep)
    expect(calls).toBe(1)
    expect(failed).toEqual(['a'])
  })
})
