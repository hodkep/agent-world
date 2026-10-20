import { describe, expect, it } from 'vitest'
import { SWITCH_CONTINUE, byProject, planSwitch, pickedByDefault, type SwitchAgent } from './switchPlan'

const agent = (name: string, o: Partial<SwitchAgent> = {}): SwitchAgent => ({ id: name, name, provider: 'claude', account: '', project: '/p/shop', online: true, activity: 'idle', ...o })
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

describe('planSwitch with a choice of agents', () => {
  const all = [agent('ada', { activity: 'implementing' }), agent('bo'), agent('cy', { account: 'work' }), agent('di', { project: '/p/billing', account: 'rush' }), agent('gem', { provider: 'agy' })]

  it('moves only the agents picked, working ones stopped first, and leaves the rest where they are', () => {
    const plan = planSwitch(all, 'work', claudeOnly, new Set(['ada', 'di']))
    expect(plan.stop.map((a) => a.name)).toEqual(['ada'])
    expect(plan.quiet.map((a) => a.name)).toEqual(['di'])
    expect(plan.moving).toBe(2)
    expect(plan.left.map((a) => a.name)).toEqual(['bo', 'cy'])
    expect(plan.unsupported.map((a) => a.name)).toEqual(['gem'])
  })

  it('restarts a picked agent that is already on the account, which is how a stale one is put right', () => {
    const plan = planSwitch(all, 'work', claudeOnly, new Set(['cy']))
    expect(plan.quiet.map((a) => a.name)).toEqual(['cy'])
    expect(plan.moving).toBe(1)
    expect(plan.already).toEqual([])
  })

  it('picks nobody, and an agent of a program with one login is never moved even when its id is in the choice', () => {
    expect(planSwitch(all, 'work', claudeOnly, new Set()).moving).toBe(0)
    expect(planSwitch(all, 'work', claudeOnly, new Set(['gem'])).moving).toBe(0)
  })

  it('is the old plan for every agent not on the account when nothing is chosen', () => {
    expect(planSwitch(all, 'work', claudeOnly).moving).toBe(3)
  })
})

describe('which agents are ticked when the dialog opens, and how they are grouped', () => {
  const all = [agent('ada'), agent('cy', { account: 'work' }), agent('di', { project: '/p/billing' }), agent('gem', { provider: 'agy' })]
  it('are the agents that can change account and are not on it yet', () => {
    expect([...pickedByDefault(all, 'work', claudeOnly)]).toEqual(['ada', 'di'])
    expect([...pickedByDefault([agent('x', { account: 'work' })], 'work', claudeOnly)]).toEqual([])
  })
  it('are grouped by project in the order agents come, named by the folder', () => {
    expect(byProject(all).map((g) => [g.name, g.agents.map((a) => a.name)])).toEqual([['shop', ['ada', 'cy', 'gem']], ['billing', ['di']]])
  })
})
