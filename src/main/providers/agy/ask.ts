import { stripVTControlCharacters } from 'node:util'
import type { Question, QuestionAnswer } from '../../../shared/types'
import type { AskRow, AskScreen, TerminalIO } from '../ports'

const INVISIBLE = /[​-‏‪-‮⁠-⁩﻿]/g
const shownLines = (screen: string) => stripVTControlCharacters(screen).replace(INVISIBLE, '').split('\n').map((l) => l.trim()).filter(Boolean)
const RULE = /^[─━]{8,}$/
const QUESTION = /^Question (\d+)\/(\d+):\s*(.*)$/
const ROW = /^(>)?\s*(\d+)\.\s+(?:\[( |x)\]\s+)?(\S.*?)\s*$/
const DOWN = '\x1b[B'
const UP = '\x1b[A'
const RIGHT = '\x1b[C'
const POLL_MS = 100
const SETTLE_MS = 150

/**
 * The box agy draws for its ask_question tool: a "Question" heading over a rule, "Question 1/2: text", numbered answers (ticks for several choices,
 * "Write-in..." last), then a hint and the footer. Like its permission box it counts only as the last thing on the screen, so the same words in text
 * the model printed higher up are never taken for a question.
 */
export function parseAsk(screen: string): AskScreen | null {
  const all = shownLines(screen)
  if (!all.at(-1)?.startsWith('esc to cancel') || !/^↑\/↓ Navigate|^enter Submit · esc Back/.test(all.at(-2) ?? '')) return null
  const hint = all.length - 2
  const head = all.findLastIndex((l) => QUESTION.test(l))
  if (head < 2 || !RULE.test(all[head - 1]!) || all[head - 2] !== 'Question') return null
  // The question may wrap onto further lines before the first answer.
  let first = head + 1
  while (first < hint && !ROW.test(all[first]!)) first++
  const prompt = [QUESTION.exec(all[head]!)![3]!, ...all.slice(head + 1, first)].join(' ').trim()
  const rows: AskRow[] = []
  let cursor = 0
  for (const l of all.slice(first, hint)) {
    const m = ROW.exec(l)
    if (!m) continue
    if (m[1]) cursor = Number(m[2])
    rows.push({ n: Number(m[2]), label: m[4]!, ...(m[3] !== undefined && { checked: m[3] === 'x' }) })
  }
  if (rows.length < 2) return null
  return { kind: 'question', prompt, cursor, rows, multi: all.some((l) => /space Toggle/.test(l)) }
}

const same = (a: string, b: string) => a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim()

/**
 * Presses the keys that answer the open question box, one question after another: Down to an answer then Enter (which moves on, or sends the last one),
 * Space on each ticked answer then → (or Enter on the last question, "Submit All"), and typed words on "Write-in...". Nothing is pressed without
 * looking at the screen first.
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
    return s && same(s.prompt, q.question) ? s : null
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

  for (const [i, q] of questions.entries()) {
    const a = answers[i]
    if (!a || !(await until(asked(q)))) return false
    const lastQuestion = i === questions.length - 1
    if (q.multiSelect) {
      const want = new Set(a.picks.map((p) => p + 1))
      for (let n = 1; n <= q.options.length; n++) {
        if (!!row(n)?.checked === want.has(n)) continue
        if (!(await moveTo(n))) return false
        io.write(' ')
        if (!(await until(() => !!row(n)?.checked === want.has(n)))) return false
      }
      io.write(lastQuestion ? '\r' : RIGHT)
    } else if (a.other !== undefined) {
      // Free text goes into the field that "Write-in..." opens, as plain keystrokes; control characters would press keys.
      const text = a.other.replace(/[\x00-\x1f\x7f]/g, '').trim()
      if (!text || !(await moveTo(q.options.length + 1))) return false
      io.write('\r')
      if (!(await until(() => /Your answer:/.test(stripVTControlCharacters(io.screen()))))) return false
      io.write(text)
      if (!(await until(() => stripVTControlCharacters(io.screen()).includes(text)))) return false
      io.write('\r')
    } else {
      const pick = a.picks[0]
      if (pick === undefined || !(await moveTo(pick + 1))) return false
      io.write('\r')
    }
    // Moved on: the next question, or the box closed.
    const moved = await until(() => {
      const s = parseAsk(io.screen())
      return !s || !same(s.prompt, q.question) ? { s } : null
    })
    if (!moved) return false
  }
  return !!(await until(() => !parseAsk(io.screen())))
}
