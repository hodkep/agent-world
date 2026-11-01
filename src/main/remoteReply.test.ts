import { describe, expect, it } from 'vitest'
import { type Gate, UNPROVEN, howToReply, remoteHint, resolveReply, touches } from './remoteReply'

/** A gate that lists its own words: nothing in the module knows them. */
const gate = (label: string, code: string, verbs: string[], done: string[] = []): Gate => ({
  label,
  code,
  replies: verbs.map((verb) => ({ verb, usage: `${verb} CODE`, does: `${verb} it` })),
  apply: (r) => (done.push(`${r.verb} ${r.rest}`.trim()), `did ${r.verb}`)
})
const plan = (code: string, done: string[] = []) => gate('the plan', code, ['approve', 'changes', 'release'], done)
const push = (code: string, done: string[] = []) => gate('the held push', code, ['allow', 'decline'], done)

describe('howToReply: the words the agent tells the person come from the gate itself', () => {
  it('names the code in each word the gate lists, with what it does', () => {
    expect(howToReply(push('e5f'))).toBe('reply `allow e5f` (allow it) or `decline e5f` (decline it)')
    expect(howToReply(plan('7k2'))).toBe('reply `approve 7k2` (approve it), `changes 7k2` (changes it) or `release 7k2` (release it)')
  })
  it('takes any word a new gate invents, with no change to this module', () => {
    expect(howToReply(gate('the nap', 'x9z', ['nap']))).toBe('reply `nap x9z` (nap it)')
  })
})

describe('resolveReply: a typed reply decides the gate it names, or says why not', () => {
  it('applies the word to the gate with that code and returns what the agent is told', () => {
    const done: string[] = []
    const out = resolveReply([plan('7k2', done), push('e5f', done)], 'allow e5f')
    expect(out).toContain('did allow')
    expect(done).toEqual(['allow'])
  })
  it('passes what the word takes to the gate', () => {
    const done: string[] = []
    resolveReply([gate('the step', 'a1b', ['approve', 'changes'], done)], 'changes a1b: smaller commits')
    expect(done).toEqual(['changes smaller commits'])
  })
  it('refuses a word the gate does not take, and a code nothing waits under, and applies nothing', () => {
    const done: string[] = []
    expect(resolveReply([push('e5f', done), plan('7k2', done)], 'approve e5f')).toMatch(/does not take "approve"/)
    expect(resolveReply([push('e5f', done)], 'approve zzz')).toBeNull()
    expect(done).toEqual([])
  })
  it('turns a refusal by the gate (a question still open) into the agent\'s text, not an error', () => {
    const g: Gate = { ...plan('7k2'), apply: () => { throw new Error('1 question is still open.') } }
    expect(resolveReply([g], 'approve 7k2')).toContain('1 question is still open.')
  })
  it('says what was meant when a message uses a waiting code but is not a decision', () => {
    const out = resolveReply([plan('7k2')], 'Apptoved 7k2')!
    expect(out).toContain('7k2')
    expect(out).toContain('tell the person')
    expect(out).toContain('approve 7k2')
  })
  it('takes the words from the waiting gates: a word no gate lists is not a decision, and a new gate\'s own word is', () => {
    const done: string[] = []
    expect(resolveReply([push('e5f', done)], 'approve e5f')).toContain('not exactly a decision')
    expect(resolveReply([gate('the nap', 'x9z', ['nap'], done)], 'nap x9z')).toContain('did nap')
    expect(done).toEqual(['nap'])
  })
  it('is nothing for ordinary talk, and when nothing waits', () => {
    expect(resolveReply([plan('7k2')], 'looks good, go ahead')).toBeNull()
    expect(resolveReply([], 'approve 7k2')).toBeNull()
  })
})

describe('remoteHint: what the agent adds for the person when a gate is waiting', () => {
  it('names each waiting decision and how to answer it, and is empty when nothing waits', () => {
    expect(remoteHint([])).toBe('')
    const text = remoteHint([plan('7k2'), push('e5f')])
    expect(text).toContain('remote control')
    expect(text).toContain('the plan: reply `approve 7k2`')
    expect(text).toContain('the held push: reply `allow e5f`')
  })
})

describe('touches: a message that is, or looks like, a decision on a waiting gate', () => {
  it('is true for a decision and for one that only names a waiting code, false for anything else', () => {
    const gates = [plan('7k2')]
    expect(touches(gates, 'approve 7k2')).toBe(true)
    expect(touches(gates, 'Apptoved 7k2')).toBe(true)
    expect(touches(gates, 'approve zzz')).toBe(false)
    expect(touches(gates, 'looks good')).toBe(false)
    expect(touches([], 'approve 7k2')).toBe(false)
  })
  it('has a text for the agent when it could not be shown to come from the person', () => {
    expect(UNPROVEN).toContain('nothing was decided')
  })
})
