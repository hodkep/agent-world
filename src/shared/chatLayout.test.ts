import { describe, expect, it } from 'vitest'
import { DEFAULT_LAYOUT, arrange, checkLayout, isDefault, matches, type ChatLayout, type Desc, type Rule } from './chatLayout'

type R = { kind: string; id: string; tools?: string[]; text?: string; bad?: boolean }
const r = (kind: string, id: string, extra: Partial<R> = {}): R => ({ kind, id, ...extra })
const desc = (t: R): Desc => ({ kind: t.kind, tools: t.tools ?? [], text: t.text ?? '', bad: !!t.bad })
const L = (...rules: Rule[]): ChatLayout => ({ rules })
const ids = (l: { id: string }[]) => l.map((x) => x.id)

const turn = [r('user', 'u1'), r('thinking', 'th1'), r('tool', 't1', { tools: ['Bash'], text: 'npm test' }), r('tool', 't2', { tools: ['Edit'], text: 'src/a.ts' }), r('assistant', 'a1'), r('tool', 't3', { tools: ['Read'] }), r('assistant', 'a2'), r('user', 'u2'), r('tool', 't4', { tools: ['Bash'] }), r('assistant', 'a3')]

describe('the system default', () => {
  it('has no rules and leaves every row as it is', () => {
    expect(isDefault(DEFAULT_LAYOUT)).toBe(true)
    expect(arrange(turn, DEFAULT_LAYOUT, desc)).toEqual(turn)
    expect(isDefault(L({ match: { kind: ['tool'] }, place: 'hidden' }))).toBe(false)
  })
})

describe('what a rule matches', () => {
  it('needs every part it names: a kind, a tool (with * for any), words in the row, trouble', () => {
    const t = desc(r('tool', 'x', { tools: ['Bash', 'mcp__agent-world__todo_add'], text: 'Run the tests', bad: false }))
    expect(matches({ kind: ['tool'] }, t)).toBe(true)
    expect(matches({ kind: ['thinking', 'tool'] }, t)).toBe(true)
    expect(matches({ kind: ['assistant'] }, t)).toBe(false)
    expect(matches({ tool: ['bash'] }, t)).toBe(true)
    expect(matches({ tool: ['mcp__agent-world__*'] }, t)).toBe(true)
    expect(matches({ tool: ['Edit'] }, t)).toBe(false)
    expect(matches({ text: 'the TESTS' }, t)).toBe(true)
    expect(matches({ text: '/run .* tests/' }, t)).toBe(true)
    expect(matches({ tone: 'bad' }, t)).toBe(false)
    expect(matches({ kind: ['tool'], tool: ['Bash'], text: 'tests' }, t)).toBe(true)
    expect(matches({ kind: ['tool'], tool: ['Bash'], text: 'nothing like it' }, t)).toBe(false)
    expect(matches({}, t)).toBe(true)
  })
  it('a broken pattern matches nothing instead of throwing', () => {
    expect(matches({ text: '/(/' }, desc(r('tool', 'x', { text: 'a' })))).toBe(false)
  })
})

describe('placing rows by rules', () => {
  it('hidden takes the matching rows out and leaves the rest in place', () => {
    expect(ids(arrange(turn, L({ match: { tool: ['Bash'] }, place: 'hidden' }), desc))).toEqual(['u1', 'th1', 't2', 'a1', 't3', 'a2', 'u2', 'a3'])
  })

  it('the first rule that matches decides; a stream rule keeps a row where it is against the rules below it', () => {
    const out = arrange(turn, L({ match: { tool: ['Edit'] }, place: 'stream' }, { match: { kind: ['tool'] }, place: 'hidden' }), desc)
    expect(ids(out)).toEqual(['u1', 'th1', 't2', 'a1', 'a2', 'u2', 'a3'])
  })

  it('badge folds each unbroken run into one pack where the run was, with the label and icon of the rule', () => {
    const out = arrange(turn, L({ match: { kind: ['tool'] }, place: 'badge', label: 'steps', icon: '🔧' }), desc)
    expect(ids(out)).toEqual(['u1', 'th1', 'pack:rule0:t1', 'a1', 'pack:rule0:t3', 'a2', 'u2', 'pack:rule0:t4', 'a3'])
    const p = out[2] as { kind: string; items: R[]; place: string; label: string; icon: string }
    expect([p.kind, p.place, p.label, p.icon]).toEqual(['pack', 'badge', 'steps', '🔧'])
    expect(ids(p.items)).toEqual(['t1', 't2'])
  })

  it('footer gathers matching rows of the whole turn under its last row, one pack per group, and never crosses your next message', () => {
    const out = arrange(turn, L({ match: { kind: ['tool'] }, place: 'footer' }, { match: { kind: ['thinking'] }, place: 'footer' }), desc)
    expect(ids(out)).toEqual(['u1', 'a1', 'a2', 'pack:rule1:th1', 'pack:rule0:t1', 'u2', 'a3', 'pack:rule0:t4'])
  })

  it('rules with the same group put their rows into one pack, however different the rows', () => {
    const out = arrange(turn, L({ match: { kind: ['tool'] }, place: 'footer', group: 'Activity' }, { match: { kind: ['thinking'] }, place: 'footer', group: 'Activity' }), desc)
    expect(ids(out)).toEqual(['u1', 'a1', 'a2', 'pack:Activity:th1', 'u2', 'a3', 'pack:Activity:t4'])
    expect(ids((out[3] as { items: R[] }).items)).toEqual(['th1', 't1', 't2', 't3'])
  })

  it('a live turn keeps its footer at the end, so the count grows under the reply', () => {
    const live = [r('user', 'u1'), r('tool', 't1'), r('assistant', 'a1'), r('tool', 't2')]
    expect(ids(arrange(live, L({ match: { kind: ['tool'] }, place: 'footer' }), desc))).toEqual(['u1', 'a1', 'pack:rule0:t1'])
  })

  it('your own messages are never moved or hidden, whatever a rule says', () => {
    expect(ids(arrange(turn, L({ match: {}, place: 'hidden' }), desc))).toEqual(['u1', 'u2'])
  })

  it('a trouble rule can pull failures out of a hidden class', () => {
    const rows = [r('user', 'u'), r('tool', 'ok'), r('tool', 'boom', { bad: true })]
    expect(ids(arrange(rows, L({ match: { tone: 'bad' }, place: 'stream' }, { match: { kind: ['tool'] }, place: 'hidden' }), desc))).toEqual(['u', 'boom'])
  })
})

describe('reading a layout someone wrote', () => {
  it('keeps what is understood, drops what is not and says so, and never throws', () => {
    expect(checkLayout(null).layout).toEqual(DEFAULT_LAYOUT)
    expect(checkLayout('not json').problems.length).toBe(1)
    const c = checkLayout({ rules: [{ match: { kind: 'tool', tool: 'Bash' }, place: 'badge', label: 'x'.repeat(100), icon: '⚙', open: true }, { match: {}, place: 'sideways' }, 'oops', { place: 'hidden' }] })
    expect(c.layout.rules).toHaveLength(2)
    expect(c.layout.rules[0]).toEqual({ match: { kind: ['tool'], tool: ['Bash'] }, place: 'badge', label: 'x'.repeat(40), icon: '⚙', open: true })
    expect(c.layout.rules[1]).toEqual({ match: {}, place: 'hidden' })
    expect(c.problems).toHaveLength(2)
  })
  it('keeps at most 30 rules', () => {
    expect(checkLayout({ rules: Array.from({ length: 40 }, () => ({ match: {}, place: 'badge' })) }).layout.rules).toHaveLength(30)
  })
})
