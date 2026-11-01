import { describe, expect, it } from 'vitest'
import type { Run } from '../shared/runs'
import { createRemoteGates } from './remoteGates'

const run = (extra: Partial<Run> = {}): Run => ({ id: 'r1', agent: 'a1', name: 'ada', project: '/p', title: 'T', status: 'open', startedAt: 1, rounds: [{ n: 1, startedAt: 1, commits: [], steps: [], checks: [], plan: { state: 'submitted', path: 'p.md', submittedAt: 5, readback: { goal: 'g', assumptions: [], outOfScope: [], questions: [{ text: 'Which?', options: ['A', 'B'] }] } } }], ...extra }) as Run

function make(remote = true, extra: { skipAsk?: boolean; refused?: { id: string; name: string; rest: string[]; skippable: boolean } } = {}) {
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
      allowLanding: (a: string, h: string) => void calls.push(`allow ${a} ${h}`),
      skipAsked: () => (extra.skipAsk ? { run: 'r1', names: ['Build'], why: 'docs only' } : null),
      answerSkip: (_: string, ok: boolean) => (calls.push(`skip-answer ${ok}`), { names: ['Build'], why: 'docs only', approved: ok }),
      refusedFor: () => (extra.refused ? { run: 'r1', ask: extra.refused } : null),
      skipRefused: (_: string, s: string) => (calls.push(`skip-refused ${s}`), 'Review'),
      deferRefused: (_: string, s: string) => (calls.push(`defer ${s}`), 'Review'),
      endRun: (_: string, why: string) => void calls.push(`end ${why}`),
      nextAfter: () => ({ name: 'Commit' })
    } as never,
    held: { list: () => holds, decline: () => undefined, take: () => ((holds = []), undefined) } as never,
    send: (c) => void calls.push(`send ${c}`),
    afterAudit: () => undefined,
    isRemote: () => remote
  })
  return { gates, calls }
}

describe('createRemoteGates: the gates behind one typed reply, for any provider', () => {
  it('lists the plan and the held push of an agent, each with its own code', () => {
    const { gates } = make()
    expect(gates.gatesFor('a1').map((g) => g.label)).toEqual(['the plan', 'the held push'])
    expect(gates.gatesFor('a2')).toEqual([])
  })
  it('decides a plan from a typed answer, as the card does, and tells the agent what the card tells it', () => {
    const { gates, calls } = make()
    const code = gates.gatesFor('a1').find((g) => g.label === 'the plan')!.code
    expect(gates.reply('a1', `approve ${code} 1=2`)).toContain('Your plan was approved')
    expect(calls).toContain('decide r1 approved [{"question":"Which?","answer":"B"}]')
    expect(gates.reply('a1', `approve ${code}`)).toContain('still open')
  })
  it('lets a held push through on allow and keeps the window told', () => {
    const { gates, calls } = make()
    const code = gates.gatesFor('a1').find((g) => g.label === 'the held push')!.code
    const told = gates.reply('a1', `allow ${code}`)!
    expect(told).toContain('push again')
    // The plan still waits, so the agent is told its words too.
    expect(told).toContain('the plan: reply `approve')
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

describe('the questions that used to need a click: skip these steps, and what next after a refusal', () => {
  const codeOf = (gates: ReturnType<typeof make>['gates'], label: string) => gates.gatesFor('a1').find((g) => g.label === label)!.code
  it('answers the agent\'s request to skip steps with skip or keep, as the card does', () => {
    const { gates, calls } = make(true, { skipAsk: true })
    const code = codeOf(gates, 'the request to skip steps')
    expect(gates.hint('a1')).toContain(`skip ${code}`)
    expect(gates.reply('a1', `skip ${code}`)).toContain('approved skipping')
    expect(gates.reply('a1', `keep ${code}`)).toContain('kept')
    expect(calls).toEqual(['skip-answer true', 'send workflows', 'skip-answer false', 'send workflows'])
  })
  it('answers a refused step with skip, later or stop, and offers skip only when the step can be skipped', () => {
    const asked = { id: 'review', name: 'Review', rest: ['Commit'], skippable: true }
    const { gates, calls } = make(true, { refused: asked })
    const code = codeOf(gates, 'the refused step "Review"')
    expect(gates.reply('a1', `skip ${code}`)).toContain('go on')
    expect(gates.reply('a1', `later ${code}`)).toContain('again later')
    expect(gates.reply('a1', `stop ${code}`)).toContain('ended')
    expect(calls).toEqual(['skip-refused review', 'send workflows', 'defer review', 'send workflows', 'end The person stopped the run after refusing a step.', 'send workflows'])
    const fixed = make(true, { refused: { ...asked, skippable: false } })
    expect(fixed.gates.hint('a1')).not.toContain('skip ')
    expect(fixed.gates.reply('a1', `skip ${codeOf(fixed.gates, 'the refused step "Review"')}`)).toContain('not exactly a decision')
  })
})
