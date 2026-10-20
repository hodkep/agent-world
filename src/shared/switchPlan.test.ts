import { describe, expect, it } from 'vitest'
import { SWITCH_CONTINUE, planSwitch, type SwitchAgent } from './switchPlan'

const agent = (name: string, o: Partial<SwitchAgent> = {}): SwitchAgent => ({ id: name, name, provider: 'claude', account: '', online: true, activity: 'idle', ...o })
const claudeOnly = (p: string) => p === 'claude'

describe('planSwitch: what happens to each agent when all are moved to an account', () => {
  it('stops the agents that are mid-turn, and moves the idle, waiting and asleep ones quietly', () => {
    const plan = planSwitch(
      [agent('busy', { activity: 'implementing' }), agent('idle'), agent('waits', { activity: 'waiting' }), agent('asleep', { online: false, activity: 'asleep' })],
      'work',
      claudeOnly
    )
    expect(plan.stop.map((a) => a.name)).toEqual(['busy'])
    expect(plan.quiet.map((a) => a.name)).toEqual(['idle', 'waits', 'asleep'])
  })

  it('counts an agent waiting on a permission request as working', () => {
    expect(planSwitch([agent('ask', { activity: 'permission' })], 'work', claudeOnly).stop.map((a) => a.name)).toEqual(['ask'])
  })

  it('leaves alone the agents already on that account and those of a program without accounts', () => {
    const plan = planSwitch([agent('there', { account: 'work' }), agent('gem', { provider: 'agy' }), agent('move')], 'work', claudeOnly)
    expect(plan.already.map((a) => a.name)).toEqual(['there'])
    expect(plan.unsupported.map((a) => a.name)).toEqual(['gem'])
    expect(plan.quiet.map((a) => a.name)).toEqual(['move'])
    expect(plan.stop).toEqual([])
  })

  it('takes the default account as an empty id, and counts what will move', () => {
    const plan = planSwitch([agent('a', { account: 'work', activity: 'running' }), agent('b', { account: 'work' }), agent('c')], '', claudeOnly)
    expect(plan.stop.map((a) => a.name)).toEqual(['a'])
    expect(plan.quiet.map((a) => a.name)).toEqual(['b'])
    expect(plan.already.map((a) => a.name)).toEqual(['c'])
    expect(plan.moving).toBe(2)
  })

  it('sends the plain word continue to the agents it stopped', () => {
    expect(SWITCH_CONTINUE).toBe('continue')
  })
})
