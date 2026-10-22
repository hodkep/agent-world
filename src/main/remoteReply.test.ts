import { describe, expect, it } from 'vitest'
import { type Gate, UNPROVEN, howToReply, remoteHint, resolveReply, touches } from './remoteReply'

const gate = (kind: Gate['kind'], code: string, done: string[] = []): Gate => ({ kind, code, apply: (r) => (done.push(`${r.verb} ${r.rest}`.trim()), `did ${r.verb}`) })

describe('howToReply: the words the agent tells the person, by kind', () => {
  it('names the code and each word the kind takes', () => {
    expect(howToReply('plan', '7k2')).toBe('reply `approve 7k2` (or `approve 7k2 1=2, 2=words` to answer its questions), `changes 7k2: what to change`, or `release 7k2`')
    expect(howToReply('step', 'a1b')).toBe('reply `approve a1b` or `changes a1b: what to change`')
    expect(howToReply('audit', 'c3d')).toBe('reply `seen c3d` (or `seen c3d 1,3`), `plan c3d 2` to add an out-of-scope finding to the plan, or `aside c3d`')
    expect(howToReply('push', 'e5f')).toBe('reply `allow e5f` or `decline e5f`')
  })
})

describe('resolveReply: a typed reply decides the gate it names, or says why not', () => {
  it('applies the word to the gate with that code and returns what the agent is told', () => {
    const done: string[] = []
    const out = resolveReply([gate('plan', '7k2', done), gate('push', 'e5f', done)], 'allow e5f')
    expect(out).toContain('did allow')
    expect(done).toEqual(['allow'])
  })
  it('passes what the word takes to the gate', () => {
    const done: string[] = []
    resolveReply([gate('step', 'a1b', done)], 'changes a1b: smaller commits')
    expect(done).toEqual(['changes smaller commits'])
  })
  it('refuses a word the gate does not take, and a code nothing waits under, and applies nothing', () => {
    const done: string[] = []
    expect(resolveReply([gate('push', 'e5f', done)], 'approve e5f')).toMatch(/does not take "approve"/)
    expect(resolveReply([gate('push', 'e5f', done)], 'approve zzz')).toBeNull()
    expect(done).toEqual([])
  })
  it('turns a refusal by the gate (a question still open) into the agent\'s text, not an error', () => {
    const g: Gate = { kind: 'plan', code: '7k2', apply: () => { throw new Error('1 question is still open.') } }
    expect(resolveReply([g], 'approve 7k2')).toContain('1 question is still open.')
  })
  it('says what was meant when a message uses a waiting code but is not a decision', () => {
    const out = resolveReply([gate('plan', '7k2')], 'Apptoved 7k2')!
    expect(out).toContain('7k2')
    expect(out).toContain('tell the person')
    expect(out).toContain('approve 7k2')
  })
  it('is nothing for ordinary talk, and when nothing waits', () => {
    expect(resolveReply([gate('plan', '7k2')], 'looks good, go ahead')).toBeNull()
    expect(resolveReply([], 'approve 7k2')).toBeNull()
  })
})

describe('remoteHint: what the agent adds for the person when a gate is waiting', () => {
  it('names each waiting decision and how to answer it, and is empty when nothing waits', () => {
    expect(remoteHint([])).toBe('')
    const text = remoteHint([gate('plan', '7k2'), gate('push', 'e5f')])
    expect(text).toContain('remote control')
    expect(text).toContain('the plan: reply `approve 7k2`')
    expect(text).toContain('the held push: reply `allow e5f`')
  })
})

describe('touches: a message that is, or looks like, a decision on a waiting gate', () => {
  it('is true for a decision and for one that only names a waiting code, false for anything else', () => {
    const gates = [gate('plan', '7k2')]
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
