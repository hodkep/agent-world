import { describe, expect, it } from 'vitest'
import { isCanonicalTool } from '../../shared/tools'
import { providers } from './registry'

// The contract every program must meet to be drawn like the others: whatever it calls its tools, the chat is given its own names.
describe.each(providers().map((p) => [p.id, p] as const))('%s tool calls', (_id, p) => {
  it('ships a sample of each tool it uses', () => {
    expect(p.callSamples.length).toBeGreaterThan(0)
  })
  it('says every sample in the chat vocabulary, with an id each can be matched by', () => {
    for (const raw of p.callSamples) {
      const out = p.calls.translate(raw)
      expect(out.length, raw.name).toBeGreaterThan(0)
      for (const c of out) {
        expect(isCanonicalTool(c.name), `${raw.name} became ${c.name}`).toBe(true)
        expect(c.id, raw.name).not.toBe('')
        expect(typeof c.input).toBe('object')
      }
    }
  })
  it('passes a tool it has never heard of on as it is, so a new tool never breaks the chat', () => {
    expect(p.calls.translate({ id: 'z', name: 'not_a_real_tool', args: { a: 1 } })).toEqual([{ id: 'z', name: 'not_a_real_tool', input: { a: 1 } }])
  })
})
