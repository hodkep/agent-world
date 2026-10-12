import { describe, expect, it } from 'vitest'
import type { ChatItem } from './chat'
import { intentPrompt, parseIntent, requestOf } from './intent'
import type { PlanReadback } from './plan'

const plan: PlanReadback = {
  goal: 'Add a dark-mode toggle to Settings.',
  assumptions: [{ kind: 'given', text: 'The toggle lives in Settings.' }, { kind: 'guessed', text: 'The choice is saved in preferences.json.' }],
  outOfScope: ['A theme per project.'],
  questions: [{ text: 'Every window or only this one?', options: ['Every window', 'This window'] }]
}

describe('asking a model what the plan left open about the request', () => {
  it('gives it the request, the whole read-back (so it does not repeat a question already asked) and the shape of the reply', () => {
    const { prompt } = intentPrompt('add dark mode to the app', plan)
    for (const part of ['add dark mode to the app', 'Add a dark-mode toggle to Settings.', '[given] The toggle lives in Settings.', '[guessed] The choice is saved in preferences.json.', 'A theme per project.', 'Every window or only this one?', '"gaps"', '"question"', '"options"']) expect(prompt).toContain(part)
  })

  it('keeps the end of a very long request, since the latest words are the ones that decide, and says it was cut', () => {
    const long = 'START ' + 'x'.repeat(6000) + ' END'
    const { prompt } = intentPrompt(long, plan)
    expect(prompt).toContain(' END')
    expect(prompt).not.toContain('START')
    expect(prompt).toContain('(the start of the request was cut)')
  })
})

describe('reading the list of gaps the model gave', () => {
  it('turns each gap into a plan question marked as coming from the check', () => {
    const reply = '{"gaps":[{"question":"Should the toggle follow the system setting?","options":["Follow the system","Always manual"]},{"question":"Does the dark theme need new icons?","options":[]}]}'
    expect(parseIntent(reply)).toEqual([
      { text: 'Should the toggle follow the system setting?', options: ['Follow the system', 'Always manual'], source: 'check' },
      { text: 'Does the dark theme need new icons?', options: [], source: 'check' }
    ])
  })

  it('finds the JSON in prose, drops what it cannot show, trims, caps the choices at four and the list at three, and says null when there is no list', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ question: `Gap ${i}?`, options: ['a'] }))
    expect(parseIntent('Sure:\n```json\n{"gaps":[{"question":"  Kept?  ","options":[" one ","","two","three","four","five",7]},{"question":" "},"oops",null]}\n```')).toEqual([{ text: 'Kept?', options: ['one', 'two', 'three', 'four'], source: 'check' }])
    expect(parseIntent(JSON.stringify({ gaps: many }))!.map((g) => g.text)).toEqual(['Gap 0?', 'Gap 1?', 'Gap 2?'])
    expect(parseIntent('{"gaps":[]}')).toEqual([])
    expect(parseIntent('All clear.')).toBeNull()
    expect(parseIntent('{"findings":[]}')).toBeNull()
  })
})

describe('the person\'s request, read from the conversation', () => {
  const user = (id: number, text: string): ChatItem => ({ kind: 'user', id: `u${id}`, at: id, text })
  const said = (id: number): ChatItem => ({ kind: 'assistant', id: `a${id}`, at: id, text: 'ok' })

  it('is the last three things the person typed, oldest first, without what the office typed or the agent said', () => {
    const items = [user(1, 'old'), said(2), user(3, 'add dark mode'), user(4, '[Agent World] Your plan was approved.'), said(5), user(6, 'make it follow the system'), user(7, 'and keep it small')]
    expect(requestOf(items)).toBe('add dark mode\n\nmake it follow the system\n\nand keep it small')
  })

  it('is empty when the person has typed nothing', () => {
    expect(requestOf([said(1)])).toBe('')
    expect(requestOf([])).toBe('')
  })
})
