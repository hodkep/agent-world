import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Question, QuestionAnswer } from '../../../shared/types'
import type { TerminalIO } from '../ports'
import { driveAnswers, parseAsk } from './ask'
import { agyScreen } from './screen'

const fx = (n: string) => readFileSync(join(__dirname, 'fixtures', `${n}.txt`), 'utf8')

describe('reading agy\'s question box', () => {
  it('reads the question, its answers and the cursor, for a single choice', () => {
    expect(parseAsk(fx('ask-single'))).toEqual({
      kind: 'question',
      prompt: 'Which deployment environment should be targeted?',
      cursor: 1,
      rows: [{ n: 1, label: '(Recommended) Production' }, { n: 2, label: 'Staging' }, { n: 3, label: 'Development' }, { n: 4, label: 'Write-in...' }],
      multi: false
    })
  })
  it('reads the ticks of a multiple choice, and where the cursor is', () => {
    const s = parseAsk(fx('ask-multi'))!
    expect(s.multi).toBe(true)
    expect(s.cursor).toBe(2)
    expect(s.rows.map((r) => [r.n, r.checked])).toEqual([[1, false], [2, true], [3, false], [4, undefined]])
  })
  it('is nothing for a permission box, an idle prompt, or the same words printed higher up', () => {
    expect(parseAsk(fx('permission'))).toBeNull()
    expect(parseAsk(fx('permission-create'))).toBeNull()
    expect(parseAsk(fx('idle'))).toBeNull()
    expect(parseAsk(fx('ask-single') + '\n> next message')).toBeNull()
  })
  it('counts as a menu that is open, so the agent shows as waiting', () => {
    expect(agyScreen.anyMenu(fx('ask-single'))).toBe(true)
    expect(agyScreen.parseAsk(fx('ask-single'))).not.toBeNull()
  })
})

// A stand-in for the box: draws what agy draws for the state it is in, and reacts to the keys pressed.
function box(questions: Question[]) {
  const picked: (number[] | string)[] = []
  let q = 0
  let at = 0
  let ticks: boolean[] = []
  let typing: string | null = null
  const reset = () => ((at = 0), (ticks = (questions[q]?.options ?? []).map(() => false)), (typing = null))
  reset()
  const screen = () => {
    if (q >= questions.length) return '> '
    const cur = questions[q]!
    const multi = cur.multiSelect
    const rows = [...cur.options.map((o) => o.label), 'Write-in...'].map((l, i) => `${i === at ? '>' : ' '} ${i + 1}. ${multi && i < cur.options.length ? `[${ticks[i] ? 'x' : ' '}] ` : ''}${l}`)
    const hint = typing !== null ? '  enter Submit · esc Back' : `  ↑/↓ Navigate · ${multi ? '← Back · space Toggle · enter Submit All' : q < questions.length - 1 ? '→ Next · enter Select' : 'enter Select'} · esc Skip`
    return ['Question', '─'.repeat(40), `Question ${q + 1}/${questions.length}: ${cur.question}`, ...rows, ...(typing !== null ? ['  Your answer:', `  ${typing}`] : []), hint, 'esc to cancel          Gemini 3.8 Flash · high'].join('\n')
  }
  const write = (keys: string) => {
    if (q >= questions.length) return
    const cur = questions[q]!
    const last = cur.options.length
    if (typing !== null) {
      if (keys === '\r') (picked.push(typing), q++, reset())
      else typing += keys
    } else if (keys === '\x1b[B') at = Math.min(last, at + 1)
    else if (keys === '\x1b[A') at = Math.max(0, at - 1)
    else if (keys === ' ' && cur.multiSelect && at < last) ticks[at] = !ticks[at]
    else if (keys === '\x1b[C' && cur.multiSelect) (picked.push(ticks.flatMap((t, i) => (t ? [i] : []))), q++, reset())
    else if (keys === '\r') {
      if (at === last) typing = ''
      else if (cur.multiSelect) (picked.push(ticks.flatMap((t, i) => (t ? [i] : []))), q++, reset())
      else (picked.push([at]), q++, reset())
    }
  }
  const io: TerminalIO = { screen, write, sleep: async () => undefined }
  return { io, picked }
}

const Q = (question: string, labels: string[], multiSelect = false): Question => ({ question, header: '', options: labels.map((label) => ({ label, description: '' })), multiSelect })

describe('answering agy\'s question box with keys', () => {
  it('presses the options of each question in turn, a choice, a multiple choice and free text', async () => {
    const qs = [Q('Where?', ['A', 'B', 'C']), Q('Which channels?', ['X', 'Y', 'Z'], true), Q('Anything else?', ['No', 'Yes'])]
    const answers: QuestionAnswer[] = [{ picks: [2] }, { picks: [0, 2] }, { picks: [], other: 'my own answer' }]
    const { io, picked } = box(qs)
    expect(await driveAnswers(io, qs, answers)).toBe(true)
    expect(picked).toEqual([[2], [0, 2], 'my own answer'])
  })
  it('answers a lone single question with Enter, and refuses when the box is not the one asked about', async () => {
    const one = [Q('Proceed?', ['Yes', 'No'])]
    const { io, picked } = box(one)
    expect(await driveAnswers(io, one, [{ picks: [1] }])).toBe(true)
    expect(picked).toEqual([[1]])
    const other = box([Q('Something else?', ['a', 'b'])])
    expect(await driveAnswers(other.io, one, [{ picks: [0] }], { timeoutMs: 20 })).toBe(false)
    expect(other.picked).toEqual([])
  })
})
