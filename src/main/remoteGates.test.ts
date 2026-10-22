import { describe, expect, it } from 'vitest'
import type { Run } from '../shared/runs'
import { createRemoteGates } from './remoteGates'

const run = (extra: Partial<Run> = {}): Run => ({ id: 'r1', agent: 'a1', name: 'ada', project: '/p', title: 'T', status: 'open', startedAt: 1, rounds: [{ n: 1, startedAt: 1, commits: [], steps: [], checks: [], plan: { state: 'submitted', path: 'p.md', submittedAt: 5, readback: { goal: 'g', assumptions: [], outOfScope: [], questions: [{ text: 'Which?', options: ['A', 'B'] }] } } }], ...extra }) as Run

function make(remote = true) {
  const calls: string[] = []
  let holds = [{ agentId: 'a1', head: 'h1', held: ['x'], declined: false }]
  const gates = createRemoteGates({
    workflows: {
      runs: () => [run()],
      decide: (id: string, state: string, o: { answers?: unknown[] }) => void calls.push(`decide ${id} ${state} ${JSON.stringify(o.answers ?? [])}`),
      waitingStep: () => null,
      approveStep: () => undefined,
      seen: () => undefined,
      addToPlan: () => undefined,
      asideAudit: () => undefined,
      allowLanding: (a: string, h: string) => void calls.push(`allow ${a} ${h}`)
    } as never,
    held: { list: () => holds, decline: () => undefined, take: () => ((holds = []), undefined) } as never,
    send: (c) => void calls.push(`send ${c}`),
    afterAudit: () => undefined,
    isRemote: () => remote
  })
  return { gates, calls }
}

describe('createRemoteGates: the four gates behind one typed reply, for any provider', () => {
  it('lists the plan and the held push of an agent, each with its own code', () => {
    const { gates } = make()
    expect(gates.gatesFor('a1').map((g) => g.kind)).toEqual(['plan', 'push'])
    expect(gates.gatesFor('a2')).toEqual([])
  })
  it('decides a plan from a typed answer, as the card does, and tells the agent what the card tells it', () => {
    const { gates, calls } = make()
    const code = gates.gatesFor('a1').find((g) => g.kind === 'plan')!.code
    expect(gates.reply('a1', `approve ${code} 1=2`)).toContain('Your plan was approved')
    expect(calls).toContain('decide r1 approved [{"question":"Which?","answer":"B"}]')
    expect(gates.reply('a1', `approve ${code}`)).toContain('still open')
  })
  it('lets a held push through on allow and keeps the window told', () => {
    const { gates, calls } = make()
    const code = gates.gatesFor('a1').find((g) => g.kind === 'push')!.code
    expect(gates.reply('a1', `allow ${code}`)).toContain('push again')
    expect(calls).toEqual(['allow a1 h1', 'send landing'])
  })
  it('does nothing and says nothing for an agent that is not under remote control', () => {
    const { gates, calls } = make(false)
    const code = gates.gatesFor('a1')[0]!.code
    expect(gates.reply('a1', `approve ${code} 1=1`)).toBeNull()
    expect(gates.hint('a1')).toBe('')
    expect(calls).toEqual([])
  })
})
