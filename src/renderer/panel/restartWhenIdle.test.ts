import { describe, expect, it } from 'vitest'
import { restartRefusal, restartWhenIdle } from './restartWhenIdle'

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

describe('saying why agents were not restarted', () => {
  it('tells busy agents to try again when they finish', () => {
    expect(restartRefusal([{ name: 'ada', why: 'Wait until it finishes its turn.' }])).toBe('ada is in the middle of a turn. Try again when it finishes.')
    expect(restartRefusal([{ name: 'ada', why: 'Wait until it finishes its turn.' }, { name: 'bo', why: 'Wait until it finishes its turn.' }])).toBe('ada, bo are in the middle of a turn. Try again when they finish.')
  })
  it('lists several other refusals one to a line', () => {
    expect(restartRefusal([{ name: 'ada', why: 'No.' }, { name: 'bo', why: 'Not now.' }])).toBe('• ada: No.\n• bo: Not now.')
  })
  it('gives any other refusal in the main process\'s own words, per agent, so an asleep agent is not called busy', () => {
    expect(restartRefusal([{ name: 'ada', why: 'It is asleep: wake it first.' }, { name: 'bo', why: 'Wait until it finishes its turn.' }])).toBe('• ada: It is asleep: wake it first.\nbo is in the middle of a turn. Try again when it finishes.')
  })
})
