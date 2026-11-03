import { describe, expect, it } from 'vitest'
import { buildInstructions } from './instructions'

const item = (id: string, title: string, text: string, core: boolean) => ({ id, title, text, core })

describe('what the voice is told when it starts', () => {
  it('starts with how to talk and how to treat the agents', () => {
    const t = buildInstructions({ workspace: 'shop', items: [], extra: '', lastSummary: '' })
    expect(t).toMatch(/thinking partner/i)
    expect(t).toMatch(/BACKGROUND DATA/)
    expect(t).toMatch(/send_message/)
    expect(t).toMatch(/without asking again/i)
    expect(t).toMatch(/unless the person's own words below say otherwise/i)
    expect(t).toMatch(/idle/i)
    expect(t).toMatch(/get_limits/)
    expect(t).toMatch(/get_usage/)
    expect(t).toMatch(/list_workflow_runs/)
    expect(t).toMatch(/list_todos/)
    expect(t).toMatch(/estimate/i)
  })
  it('puts always-on playbook items in whole and lists the others by title for the fetch tool', () => {
    const t = buildInstructions({ workspace: 'shop', items: [item('brainstorm', 'Brainstorm', 'Ask what problem first.', true), item('review', 'Plan review', 'Four questions to ask of a plan.', false)], extra: '', lastSummary: '' })
    expect(t).toContain('Ask what problem first.')
    expect(t).toMatch(/review: Plan review/)
    expect(t).not.toContain('Four questions to ask of a plan.')
    expect(t).toMatch(/get_playbook_item/)
  })
  it('adds the person\'s own words and the last talk\'s summary, each under its own heading', () => {
    const t = buildInstructions({ workspace: 'shop', items: [], extra: 'Call me Pratik.', lastSummary: 'We chose percent discounts.' })
    expect(t).toMatch(/Call me Pratik\./)
    expect(t).toMatch(/Last time[\s\S]*We chose percent discounts\./)
  })
  it('names the workspace so the talk stays in it', () => {
    expect(buildInstructions({ workspace: 'shop', items: [], extra: '', lastSummary: '' })).toMatch(/workspace "shop"/)
  })
  it('cuts what is too long, so the start of a talk never costs more than a few thousand tokens', () => {
    const t = buildInstructions({ workspace: 'shop', items: [item('big', 'Big', 'x'.repeat(50_000), true)], extra: 'y'.repeat(50_000), lastSummary: 'z'.repeat(50_000) })
    expect(t.length).toBeLessThan(12_000)
  })
})
