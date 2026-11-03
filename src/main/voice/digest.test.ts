import { describe, expect, it } from 'vitest'
import { buildDigest, scrub } from './digest'

const base = { workspace: 'shop', agents: [{ name: 'ada', state: 'working', doing: 'fixing cart rounding' }, { name: 'grace', state: 'waiting' }, { name: 'hai', state: 'idle' }], todos: ['Pick the runner by score'], needsYou: ['grace: plan for the Settings table'], notes: ['We chose percent discounts'] }

describe('the digest of a workspace', () => {
  it('names each agent with its state and what it is doing', () => {
    const t = buildDigest(base)
    expect(t).toMatch(/ada \(working: fixing cart rounding\)/)
    expect(t).toMatch(/grace \(waiting\)/)
    expect(t).toMatch(/hai \(idle\)/)
  })
  it('adds what an agent said last, shortened, so the voice can tell what it did', () => {
    const t = buildDigest({ ...base, agents: [{ name: 'ada', state: 'idle', last: 'Done. I changed health.ts and the tests pass.' }] })
    expect(t).toMatch(/ada \(idle; last said: "Done\. I changed health\.ts and the tests pass\."\)/)
  })
  it('marks the agent the person has open in the app', () => {
    expect(buildDigest({ ...base, agents: [{ name: 'ada', state: 'idle', open: true }, { name: 'hai', state: 'idle' }] })).toMatch(/ada \[open in the app\] \(idle\); hai \(idle\)/)
  })
  it('lists what needs the person, the open todos and the notes, each under its name', () => {
    const t = buildDigest(base)
    expect(t).toMatch(/Needs the person: grace: plan for the Settings table/)
    expect(t).toMatch(/Open todos: Pick the runner by score/)
    expect(t).toMatch(/Notes: We chose percent discounts/)
  })
  it('leaves out a section that has nothing in it', () => {
    const t = buildDigest({ ...base, todos: [], needsYou: [], notes: [] })
    expect(t).not.toMatch(/todos|Needs the person|Notes/)
  })
  it('stays within its size, so a busy workspace does not cost a fortune at every connect', () => {
    const many = { ...base, agents: Array.from({ length: 200 }, (_, i) => ({ name: `agent${i}`, state: 'working', doing: 'x'.repeat(80) })) }
    expect(buildDigest(many, 1500).length).toBeLessThanOrEqual(1500)
  })
  it('keeps secrets out of what the voice is told', () => {
    const t = buildDigest({ ...base, notes: ['key is AIzaSyD3x4mpleK7Qx90bJm2LrTz8Vn5wHcF1aE and sk-ant-api03-abcdefghijklmnop and ghp_abcdefghijklmnopqrstuvwxyz0123456789'] })
    expect(t).not.toMatch(/AIzaSyD3|sk-ant|ghp_/)
    expect(t).toMatch(/\[secret\]/)
  })
  it('scrubs a bearer token and a long hex string', () => {
    expect(scrub('Authorization: Bearer abc.def-ghi_123456789')).toBe('Authorization: Bearer [secret]')
    expect(scrub(`token ${'a1'.repeat(24)}`)).toBe('token [secret]')
  })
})
