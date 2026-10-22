import { describe, expect, it } from 'vitest'
import { answersOf, parsePlan, planCounts, planReply, unanswered } from './plan'

const good = `# Plan: dark-mode toggle

## Goal
Add a dark-mode toggle to Settings.

## Assumptions
- [given] The toggle lives in Settings.
- [guessed] The choice is saved in preferences.json.

## Out of scope
- A theme per project.

## Open questions
- Should the choice apply to every window, or only this one?
  - Every window: simple, but one window cannot differ.
  - This window: more state to keep.

## Steps
1. Add the setting.
`

describe('reading the read-back block at the top of a plan', () => {
  it('reads the goal, each assumption with how sure it is, what is out of scope, and the questions with their choices', () => {
    const r = parsePlan(good)
    expect(r).toEqual({
      ok: true,
      plan: {
        goal: 'Add a dark-mode toggle to Settings.',
        assumptions: [
          { kind: 'given', text: 'The toggle lives in Settings.' },
          { kind: 'guessed', text: 'The choice is saved in preferences.json.' }
        ],
        outOfScope: ['A theme per project.'],
        questions: [{ text: 'Should the choice apply to every window, or only this one?', options: ['Every window: simple, but one window cannot differ.', 'This window: more state to keep.'] }]
      }
    })
  })

  it('takes "none" as an empty list for out of scope and for questions, whatever its case', () => {
    const r = parsePlan(good.replace(/## Out of scope[\s\S]*?## Steps/, '## Out of scope\nNone\n\n## Open questions\nnone.\n\n## Steps'))
    expect(r).toMatchObject({ ok: true, plan: { outOfScope: [], questions: [] } })
  })

  it('says what is wrong, in words the agent can act on, when the block is incomplete', () => {
    const r = parsePlan('## Goal\n\n## Assumptions\n- The toggle is in Settings.\n')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.problems).toEqual([
      'Goal is empty: write the goal in one line under "## Goal".',
      'Assumption "The toggle is in Settings." starts with neither [given] nor [guessed].',
      'Missing "## Out of scope": list what you will not do, or write "none".',
      'Missing "## Open questions": list what you need to ask, or write "none".'
    ])
  })

  it('wants the goal on one line, and not an essay', () => {
    const two = parsePlan(good.replace('Add a dark-mode toggle to Settings.', 'Add a toggle.\nAnd also much more.'))
    expect(two).toMatchObject({ ok: false, problems: ['Goal must be one line.'] })
    const long = parsePlan(good.replace('Add a dark-mode toggle to Settings.', 'x'.repeat(260)))
    expect(long).toMatchObject({ ok: false, problems: ['Goal is over 240 characters: say it in one line.'] })
  })

  it('finds the sections whatever the heading level or case, and ignores the rest of the plan', () => {
    const r = parsePlan('### GOAL\nFix it.\n### assumptions\n- [Given] a\n### Out Of Scope\nnone\n### Open Questions\nnone\n## Steps\n- [guessed] not an assumption\n')
    expect(r).toMatchObject({ ok: true, plan: { goal: 'Fix it.', assumptions: [{ kind: 'given', text: 'a' }] } })
  })
})

describe('what the person\'s answer says to the agent', () => {
  it('approved: go ahead', () => {
    expect(planReply('approved', {})).toBe('Your plan was approved. Go ahead and build it.')
  })
  it('changes: the note and every answer, and what to do next', () => {
    const t = planReply('changes', { note: 'Also cover the settings page.', answers: [{ question: 'Every window or this one?', answer: 'Every window' }] })
    expect(t).toContain('asked for changes')
    expect(t).toContain('Also cover the settings page.')
    expect(t).toContain('Every window or this one? Every window')
    expect(t).toContain('plan_submit')
  })
  it('approved with answers still passes them on', () => {
    expect(planReply('approved', { answers: [{ question: 'Q?', answer: 'A' }] })).toContain('Q? A')
  })
  it('approved with a note passes the note on, after the go-ahead and before any answers', () => {
    const t = planReply('approved', { note: 'Keep it behind a flag.', answers: [{ question: 'Q?', answer: 'A' }] })
    expect(t).toBe('Your plan was approved. Go ahead and build it.\nTheir note: Keep it behind a flag.\nTheir answers:\n- Q? A')
    expect(planReply('approved', { note: 'Keep it behind a flag.' })).toBe('Your plan was approved. Go ahead and build it.\nTheir note: Keep it behind a flag.')
    expect(planReply('approved', { note: '   ' })).toBe('Your plan was approved. Go ahead and build it.')
  })
  it('released: the hold is lifted without approval', () => {
    expect(planReply('released', {})).toContain('lifted the hold')
  })
})

describe('which questions still block approving a plan', () => {
  const plan = { goal: 'g', assumptions: [], outOfScope: [], questions: [{ text: 'Every window?', options: ['Yes', 'No'] }, { text: 'Which name?', options: [] }] }
  it('every question needs an answer, a choice or some words', () => {
    expect(unanswered(plan, {})).toEqual(['Every window?', 'Which name?'])
    expect(unanswered(plan, { 'Every window?': 'Yes', 'Which name?': '  ' })).toEqual(['Which name?'])
    expect(unanswered(plan, { 'Every window?': 'Yes', 'Which name?': 'Toggle' })).toEqual([])
  })
  it('a plan with no questions blocks nothing, and the answers are listed in the order asked, skipping blanks', () => {
    expect(unanswered({ ...plan, questions: [] }, {})).toEqual([])
    expect(answersOf(plan, { 'Which name?': 'Toggle', 'Every window?': 'No' })).toEqual([{ question: 'Every window?', answer: 'No' }, { question: 'Which name?', answer: 'Toggle' }])
    expect(answersOf(plan, { 'Which name?': ' ' })).toEqual([])
  })
})

describe('planCounts: the one line a folded plan gate shows under its goal', () => {
  const r = { goal: 'g', assumptions: [{ kind: 'given' as const, text: 'a' }, { kind: 'guessed' as const, text: 'b' }, { kind: 'guessed' as const, text: 'c' }], outOfScope: ['x'], questions: [{ text: 'Q1?', options: [] }, { text: 'Q2?', options: [] }] }
  it('counts what was given, guessed, left out and still open', () => {
    expect(planCounts(r, {})).toBe('1 given · 2 guessed · 1 out of scope · 2 questions open')
  })
  it('stops counting a question once it is answered, and leaves out what is empty', () => {
    expect(planCounts({ ...r, outOfScope: [] }, { 'Q1?': 'yes' })).toBe('1 given · 2 guessed · 1 question open')
    expect(planCounts({ ...r, assumptions: [], outOfScope: [], questions: [] }, {})).toBe('nothing to check')
  })
})
