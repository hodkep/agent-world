import { describe, expect, it } from 'vitest'
import { cleanupPrompt, parseCleanup, planTidy } from './todoCleanup'
import type { Actor, Todo } from './todos'

const YOU: Actor = { kind: 'human', name: 'you' }
const AGENT: Actor = { kind: 'agent', name: 'os' }
let order = 0
const todo = (id: string, o: Partial<Todo> = {}): Todo => ({ id, list: 'Chat', title: `Task ${id}`, notes: '', status: 'done', needsYou: false, order: order++, createdAt: 1, createdBy: AGENT, updatedAt: 1, updatedBy: AGENT, history: [], auto: true, ...o })
/** Fills a list so that it counts as an area (five or more tasks). */
const area = (list: string, from: number) => Array.from({ length: 5 }, (_, i) => todo(String(from + i), { list, title: `${list} work ${i}`, labels: ['feature'] }))

describe('cleanupPrompt', () => {
  it('gives each task as one line with its number, list, state and title, and the areas the board has', () => {
    const p = cleanupPrompt([{ id: '12', list: 'Inbox', status: 'done', title: 'Rebase PR #130 onto main' }], ['Chat', 'Library'])
    expect(p).toContain('12 | Inbox | done | Rebase PR #130 onto main')
    expect(p).toContain('Chat, Library')
  })
})

describe('parseCleanup', () => {
  it('reads an array of answers, keeps only the fields it understands and only for the numbers asked about', () => {
    const out = parseCleanup('Here:\n[{"id":"1","drop":"chore","kind":"Chore"},{"id":"2","kind":"bug","family":"1","list":"Chat"},{"id":"77","kind":"bug"},{"id":"3","drop":"nonsense","kind":"a long label with spaces"}]', ['1', '2', '3'])
    expect(out).toEqual([
      { id: '1', drop: 'chore', kind: 'chore' },
      { id: '2', kind: 'bug', family: '1', list: 'Chat' },
      { id: '3' }
    ])
  })
  it('gives nothing for an answer that is not an array', () => {
    expect(parseCleanup('', ['1'])).toEqual([])
    expect(parseCleanup('{"id":"1"}', ['1'])).toEqual([])
    expect(parseCleanup('[1, "x", null]', ['1'])).toEqual([])
  })
})

describe('planTidy', () => {
  it('removes a message the app wrote without asking anyone, and a chore the model named, but only finished ones the app made', () => {
    const todos = [
      todo('1', { title: '[Agent World] The person pressed Run: start your step "Commit" now.' }),
      todo('2', { title: 'Rebase PR #130 onto main' }),
      todo('3', { title: 'Rebase PR #131 onto main', status: 'doing' }),
      todo('4', { title: 'Rebase PR #132 onto main', auto: undefined, createdBy: YOU })
    ]
    const plan = planTidy(todos, [{ id: '2', drop: 'chore' }, { id: '3', drop: 'chore' }, { id: '4', drop: 'chore' }])
    expect(plan.remove.map((r) => [r.id, r.why])).toEqual([['1', 'echo'], ['2', 'chore']])
  })

  it('keeps a task an agent renamed to the work it did, even though the message it was made from was one the app wrote', () => {
    const todos = [todo('1', { title: 'Build the Looks versions page in Settings', createdLink: { agentId: 'a', itemId: 'm', at: 1, excerpt: '[Agent World] Your plan was approved. Go ahead and build it.' } })]
    expect(planTidy(todos, []).remove).toEqual([])
  })

  it('calls a task a chore only when the model says so and its title reads like git or process work, so real work the model got wrong stays', () => {
    const todos = [
      todo('1', { title: 'Push branch and open PR stacked on #327' }),
      todo('2', { title: 'Add numbered look versions to Settings' }),
      todo('3', { title: 'Approve verify step; review waits for Run press' }),
      todo('4', { title: 'Start removal-feature test instance from /tmp/aw-rm-wt' }),
      todo('5', { title: 'Stop "Keep as v4" label on system-look drafts' }),
      todo('6', { title: 'Merged #327 and #328; #329 waits on delta\'s rebase' })
    ]
    // the model called all of them chores except 3, which it did not mention
    const plan = planTidy(todos, [{ id: '1', drop: 'chore' }, { id: '2', drop: 'chore' }, { id: '4', drop: 'chore' }, { id: '5', drop: 'chore' }, { id: '6', drop: 'chore' }])
    expect(plan.remove.map((r) => r.id)).toEqual(['1', '4', '6'])
  })

  it('does not remove a task that has parts', () => {
    const todos = [todo('1', { title: 'Umbrella' }), todo('2', { title: 'Part', parent: '1' })]
    expect(planTidy(todos, [{ id: '1', drop: 'chore' }]).remove).toEqual([])
  })

  it('nests a task under the first of its family, and not under something removed, nested itself, or itself', () => {
    const todos = [todo('1', { title: 'Show busy state' }), todo('2', { title: 'Busy state on cards' }), todo('3', { title: 'Pending state on cards' }), todo('4', { title: 'Rebase the branch' }), todo('5', { title: 'Other' })]
    const plan = planTidy(todos, [
      { id: '2', family: '1' },
      { id: '3', family: '2' }, // 2 is nested itself: not a parent
      { id: '5', family: '4', drop: undefined },
      { id: '4', drop: 'chore' },
      { id: '1', family: '1' } // itself
    ])
    expect(plan.nest.map((n) => [n.id, n.parent])).toEqual([['2', '1']])
  })

  it('does not nest a task that already has a parent or parts, or one the person wrote', () => {
    const todos = [todo('1'), todo('2', { parent: '1' }), todo('3'), todo('4', { parent: '3' }), todo('5', { auto: undefined, createdBy: YOU }), todo('6')]
    const plan = planTidy(todos, [{ id: '2', family: '6' }, { id: '3', family: '6' }, { id: '5', family: '6' }])
    expect(plan.nest).toEqual([])
  })

  it('labels a task that has none with the kind the model gave, and leaves a labelled one alone', () => {
    const todos = [todo('1'), todo('2', { labels: ['design'] }), todo('3')]
    const plan = planTidy(todos, [{ id: '1', kind: 'bug' }, { id: '2', kind: 'feature' }])
    expect(plan.label.map((l) => [l.id, l.label])).toEqual([['1', 'bug']])
  })

  it('moves a task out of a small list or the Inbox into an area the board really has, not into a small list', () => {
    const todos = [...area('Workflows', 100), todo('1', { list: 'Changelog' }), todo('2', { list: 'Inbox' }), todo('3', { list: 'Changelog' }), todo('4', { list: 'Changelog', auto: undefined, createdBy: YOU }), todo('5', { list: 'Workflows' })]
    const plan = planTidy(todos, [{ id: '1', list: 'Workflows' }, { id: '2', list: 'Workflows' }, { id: '3', list: 'Nowhere' }, { id: '4', list: 'Workflows' }, { id: '5', list: 'Chat' }])
    expect(plan.move.map((m) => [m.id, m.from, m.to])).toEqual([['1', 'Changelog', 'Workflows'], ['2', 'Inbox', 'Workflows']])
  })

  it('counts what it read, and gives an empty plan for an empty board', () => {
    expect(planTidy([], []).read).toBe(0)
    const plan = planTidy([todo('1')], [])
    expect(plan).toMatchObject({ read: 1, remove: [], nest: [], label: [], move: [] })
  })
})
