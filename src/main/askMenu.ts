import { stripVTControlCharacters } from 'node:util'
import type { Question, QuestionAnswer } from '../shared/types'

export interface AskRow {
  n: number
  label: string
  /** Multi-select rows only. */
  checked?: boolean
}
export interface AskScreen {
  kind: 'question' | 'review'
  prompt: string
  /** Row number under the `❯` cursor (0 if none). */
  cursor: number
  rows: AskRow[]
  multi: boolean
}

const ROW = /^\s*(❯)?\s*(\d+)\.\s+(?:\[( |✔)\]\s+)?(.*?)\s*$/

/**
 * Claude's AskUserQuestion menu, if the rendered screen shows one: a tab bar (`←  ☐ Color  ✔ Submit  →`), the
 * question, numbered rows, then a hint line. After the last question a "Review your answers" page appears.
 */
export function parseAsk(screen: string): AskScreen | null {
  const lines = stripVTControlCharacters(screen).split('\n')
  const tabs = lines.map((l) => /^\s*←.*Submit.*→/.test(l)).lastIndexOf(true)
  // A lone question has no tab bar to submit from, only its own tab (` ☐ Page`) above it; an open menu always ends with the hint line.
  const lone = tabs >= 0 ? -1 : lines.map((l, i) => /^\s*[☐☒☑✔]\s+\S/.test(l) && lines.slice(i + 1).some((x) => /Enter to select/.test(x))).lastIndexOf(true)
  const bar = tabs >= 0 ? tabs : lone
  if (bar < 0) return null
  const rest = lines.slice(bar + 1)
  const first = rest.findIndex((l) => l.trim())
  if (first < 0) return null
  const review = rest[first]!.trim().startsWith('Review your answers')
  // A long question wraps onto several lines, sometimes inside a │ frame: the prompt is all of them, up to the first option.
  const promptLines: string[] = []
  for (const l of rest.slice(first)) {
    const t = l.replace(/^[\s│┃]+|[\s│┃]+$/g, '')
    if (!t || ROW.test(l) || /Enter to select/.test(l)) break
    promptLines.push(t)
  }
  const prompt = review ? 'Review your answers' : promptLines.join(' ')
  const rows: AskRow[] = []
  let cursor = 0
  for (const l of rest.slice(first + 1)) {
    if (/Enter to select/.test(l)) break
    const m = ROW.exec(l)
    if (!m) continue
    if (m[1]) cursor = Number(m[2])
    rows.push({ n: Number(m[2]), label: m[4]!, ...(m[3] !== undefined && { checked: m[3] === '✔' }) })
  }
  if (rows.length === 0) return null
  return { kind: review ? 'review' : 'question', prompt, cursor, rows, multi: rows.some((r) => r.checked !== undefined) }
}

const DOWN = '\x1b[B'
const UP = '\x1b[A'
const RIGHT = '\x1b[C'
const LEFT = '\x1b[D'
const POLL_MS = 100
const SETTLE_MS = 150

interface TerminalIO {
  screen: () => string
  write: (keys: string) => void
  sleep: (ms: number) => Promise<void>
}

// Claude may drop or re-space quotes and punctuation when it draws a question, so compare the words only.
const words = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const same = (a: string, b: string) => words(a) === words(b)

/**
 * Answer every question in Claude's menu by pressing keys one step at a time and reading the screen back after
 * each, so a swallowed key never turns into a wrong answer. Returns false (leaving the menu open for the user)
 * as soon as the screen stops matching what was expected.
 */
export async function driveAnswers(io: TerminalIO, questions: Question[], answers: QuestionAnswer[], o: { timeoutMs?: number } = {}): Promise<boolean> {
  const timeoutMs = o.timeoutMs ?? 4000
  const until = async <T>(read: () => T | null | false): Promise<T | null> => {
    for (let i = 0; i <= Math.ceil(timeoutMs / POLL_MS); i++) {
      const v = read()
      if (v) return v
      await io.sleep(POLL_MS)
    }
    return null
  }
  const asked = (q: Question) => () => {
    const s = parseAsk(io.screen())
    return s && s.kind === 'question' && same(s.prompt, q.question) ? s : null
  }
  const moveTo = async (n: number) => {
    for (let i = 0; i < 16; i++) {
      const s = parseAsk(io.screen())
      if (!s) return false
      if (s.cursor === n) return true
      io.write(s.cursor < n ? DOWN : UP)
      await io.sleep(SETTLE_MS)
    }
    return false
  }
  const row = (n: number) => parseAsk(io.screen())?.rows.find((r) => r.n === n)
  // Long text wraps onto further lines below its row, so look at everything from the row down to the next option or divider.
  const typedOn = (n: number, text: string) => {
    const lines = stripVTControlCharacters(io.screen()).split('\n')
    const at = lines.findIndex((l) => new RegExp(`^\\s*(?:❯)?\\s*${n}\\.\\s`).test(l))
    if (at < 0) return false
    const end = lines.findIndex((l, i) => i > at && (/^\s*(?:❯)?\s*\d+\.\s/.test(l) || /^[\s─━-]{8,}$/.test(l) || /Enter to select/.test(l)))
    const squash = (t: string) => t.replace(/[\s│┃]+/g, '')
    return squash(lines.slice(at, end < 0 ? undefined : end).join('')).includes(squash(text))
  }

  // Start from the first question, whichever tab the menu was left on.
  for (let i = 0; i < questions.length && !asked(questions[0]!)(); i++) {
    io.write(LEFT)
    await io.sleep(SETTLE_MS)
  }

  for (const [i, q] of questions.entries()) {
    const a = answers[i]
    if (!a || !(await until(asked(q)))) return false
    if (q.multiSelect) {
      const want = new Set(a.picks.map((p) => p + 1))
      for (let n = 1; n <= q.options.length; n++) {
        if (!!row(n)?.checked === want.has(n)) continue
        if (!(await moveTo(n))) return false
        io.write(' ')
        if (!(await until(() => !!row(n)?.checked === want.has(n)))) return false
      }
      io.write(RIGHT)
    } else if (a.other !== undefined) {
      // Free text goes onto the "Type something" row as plain keystrokes; control characters would press keys.
      const text = a.other.replace(/[\x00-\x1f\x7f]/g, '').trim()
      const n = q.options.length + 1
      if (!text || !(await moveTo(n))) return false
      io.write(text)
      if (!(await until(() => typedOn(n, text)))) return false
      io.write('\r')
    } else {
      const pick = a.picks[0]
      if (pick === undefined || !(await moveTo(pick + 1))) return false
      io.write('\r')
    }
    // Moved on: the next question, the review page, or the menu closed.
    const moved = await until(() => {
      const s = parseAsk(io.screen())
      return !s || s.kind === 'review' || !same(s.prompt, q.question) ? { s } : null
    })
    if (!moved) return false
  }

  const s = parseAsk(io.screen())
  if (!s) return true
  if (s.kind !== 'review' || !(await moveTo(1)) || !/submit/i.test(row(1)?.label ?? '')) return false
  io.write('\r')
  return !!(await until(() => (parseAsk(io.screen()) ? null : true)))
}
