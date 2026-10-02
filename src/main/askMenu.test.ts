import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Question, QuestionAnswer } from '../shared/types'
import { driveAnswers, parseAsk } from './askMenu'

const fixture = (n: string) => readFileSync(join(__dirname, 'fixtures', n), 'utf8')

describe('reading Claude\'s question menu', () => {
  it('reads a single-choice question: prompt, rows and the cursor', () => {
    const s = parseAsk(fixture('ask-single.txt'))!
    expect(s).toMatchObject({ kind: 'question', prompt: "What's your favourite colour?", cursor: 2, multi: false })
    expect(s.rows.map((r) => r.label)).toEqual(['Red', 'Green', 'Blue', 'Type something.', 'Chat about this'])
  })

  it('reads a multi-select question with its ticks', () => {
    const s = parseAsk(fixture('ask-multi.txt'))!
    expect(s).toMatchObject({ kind: 'question', prompt: 'Which pets do you have?', cursor: 3, multi: true })
    expect(s.rows.filter((r) => r.checked).map((r) => r.label)).toEqual(['Cat', 'Fish'])
  })

  it('reads a long question that wraps onto several lines inside a frame', () => {
    const s = parseAsk(fixture('ask-wrapped.txt'))!
    expect(s).toMatchObject({ kind: 'question', prompt: 'What is OKF here? Nothing in the repo defines it, and I do not want to invent a format.', cursor: 1 })
    expect(s.rows.map((r) => r.label)).toEqual(['A file format', 'A folder', 'A tool', 'Type something.', 'Chat about this'])
  })

  it('reads a question asked on its own, which has no tab bar to submit from', () => {
    const s = parseAsk(fixture('ask-lone.txt'))!
    expect(s).toMatchObject({ kind: 'question', prompt: 'What should the page show? (It will be served on a local port, and the Preview tab picks it up from my terminal output.)', cursor: 1, multi: false })
    expect(s.rows.map((r) => r.label)).toEqual(['Blank test page', 'The composer mockup', 'Something specific', 'Type something.', 'Chat about this'])
  })

  it('does not take a task list for a question menu', () => {
    expect(parseAsk('  ☐ Fix the build\n  ☐ Write the tests\n❯ 1. Yes\n  2. No\n')).toBeNull()
    expect(parseAsk(' ☐ Fix the build\n  1. one\n  2. two\n')).toBeNull()
  })

  it('recognises the review page', () => {
    expect(parseAsk(fixture('ask-review.txt'))).toMatchObject({ kind: 'review', cursor: 1 })
  })

  it('is null when no question menu is on screen', () => {
    expect(parseAsk('❯ hello\n───\n')).toBeNull()
    expect(parseAsk('❯ 1. Yes\n  2. No\nEsc to cancel')).toBeNull()
  })
})

// A stand-in for Claude's menu that follows the behaviour seen in real runs: Enter picks and moves on
// (but toggles in multi-select), Space toggles, Right goes to the next tab, typing on the last row writes text.
// A terminal wraps what is typed onto further lines; only the first holds the row number.
const wrap = (t: string) => t.replace(/(.{30})(?=.)/g, '$1\n     ')
class FakeMenu {
  tab = 0
  cursor = 1
  done = false
  picked: Set<number>[]
  other: (string | null)[]
  constructor(readonly qs: Question[]) {
    this.picked = qs.map(() => new Set())
    this.other = qs.map(() => null)
  }
  screen() {
    if (this.done) return '❯ \n'
    const bar = `←  ${this.qs.map((q, i) => `${i < this.tab ? '☒' : '☐'} ${q.header}`).join('  ')}  ✔ Submit  →\n`
    if (this.tab >= this.qs.length) return `${bar}Review your answers\n\nReady to submit your answers?\n${this.cursor === 1 ? '❯' : ' '} 1. Submit answers\n  2. Cancel\n`
    const q = this.qs[this.tab]!
    const rows = q.options.map((o, i) => `${this.cursor === i + 1 ? '❯' : ' '} ${i + 1}. ${q.multiSelect ? (this.picked[this.tab]!.has(i + 1) ? '[✔] ' : '[ ] ') : ''}${o.label}\n     ${o.description}\n`).join('')
    const n = q.options.length + 1
    const typed = this.other[this.tab]
    return `${bar}${q.question}\n${rows}${this.cursor === n ? '❯' : ' '} ${n}. ${wrap(typed ?? 'Type something.')}\n${'─'.repeat(20)}\n  ${n + 1}. Chat about this\nEnter to select · Tab/Arrow keys to navigate · Esc to cancel\n`
  }
  write(keys: string) {
    const q = this.qs[this.tab]
    const rowCount = q ? q.options.length + 2 : 2
    if (keys === '\x1b[B') this.cursor = Math.min(rowCount, this.cursor + 1)
    else if (keys === '\x1b[A') this.cursor = Math.max(1, this.cursor - 1)
    else if (keys === '\x1b[C') this.next()
    else if (keys === '\x1b[D') this.tab = Math.max(0, this.tab - 1)
    else if (keys === ' ' && q?.multiSelect) this.toggle()
    else if (keys === '\r') {
      if (!q) this.done = this.cursor === 1
      else if (q.multiSelect) this.toggle()
      else this.next()
    } else if (q && !q.multiSelect && this.cursor === q.options.length + 1) this.other[this.tab] = (this.other[this.tab] ?? '') + keys
  }
  private toggle() {
    const set = this.picked[this.tab]!
    set.has(this.cursor) ? set.delete(this.cursor) : set.add(this.cursor)
  }
  private next() {
    const q = this.qs[this.tab]!
    if (!q.multiSelect && this.cursor <= q.options.length) this.picked[this.tab] = new Set([this.cursor])
    this.tab++
    this.cursor = 1
  }
}

const opt = (label: string) => ({ label, description: `about ${label}` })
const colour: Question = { question: 'Favourite colour?', header: 'Color', options: [opt('Red'), opt('Green'), opt('Blue')], multiSelect: false }
const pets: Question = { question: 'Which pets?', header: 'Pets', options: [opt('Cat'), opt('Dog'), opt('Fish'), opt('Bird')], multiSelect: true }

const run = (qs: Question[], answers: QuestionAnswer[]) => {
  const sim = new FakeMenu(qs)
  const ok = driveAnswers({ screen: () => sim.screen(), write: (k) => sim.write(k), sleep: async () => {} }, qs, answers)
  return ok.then((ok) => ({ ok, sim }))
}

describe('answering Claude\'s questions', () => {
  it('answers a single and a multi-select question and submits', async () => {
    const { ok, sim } = await run([colour, pets], [{ picks: [2] }, { picks: [0, 2] }])
    expect(ok).toBe(true)
    expect(sim.done).toBe(true)
    expect([...sim.picked[0]!]).toEqual([3])
    expect([...sim.picked[1]!].sort()).toEqual([1, 3])
  })

  it('types free text on the "Type something" row', async () => {
    const { ok, sim } = await run([colour], [{ picks: [], other: 'Purple' }])
    expect(ok).toBe(true)
    expect(sim.other[0]).toBe('Purple')
    expect(sim.done).toBe(true)
  })

  it('types text too long for one terminal line, which wraps onto several', async () => {
    const long = 'two buttons in the top bar, but we need to update the existing button in there as well as they are taking up much space'
    const { ok, sim } = await run([colour], [{ picks: [], other: long }])
    expect(ok).toBe(true)
    expect(sim.other[0]).toBe(long)
    expect(sim.done).toBe(true)
  })

  it('strips control characters from typed text', async () => {
    const { sim } = await run([colour], [{ picks: [], other: 'Pur\x1b[Bple\r' }])
    expect(sim.other[0]).toBe('Pur[Bple')
  })

  it('gives up without submitting when the menu does not behave', async () => {
    const stuck = { screen: () => FAKE_STUCK, write: () => {}, sleep: async () => {} }
    expect(await driveAnswers(stuck, [colour], [{ picks: [1] }], { timeoutMs: 0 })).toBe(false)
  })
})

const FAKE_STUCK = '←  ☐ Color  ✔ Submit  →\nFavourite colour?\n❯ 1. Red\n  2. Green\n  3. Blue\n  4. Type something.\n───\n  5. Chat about this\nEnter to select · Tab/Arrow keys to navigate · Esc to cancel\n'
