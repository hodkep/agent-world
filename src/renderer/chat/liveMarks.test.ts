import { describe, expect, it } from 'vitest'
import { liveMarks, type LiveMark } from './liveMarks'

/** The marks of a text with the caret (or selection) where `|` stands; the `|` itself is not part of the text. */
function marks(src: string, end?: string): LiveMark[] {
  const from = src.indexOf('|')
  const text = src.replace('|', '')
  const to = end === undefined ? from : text.length
  return liveMarks(text, { from, to })
}
const of = (ms: LiveMark[], kind: string) => ms.filter((m) => m.kind === kind).map((m) => [m.from, m.to])

describe('headings', () => {
  it('make the line big and hide the hashes when the caret is on another line', () => {
    const ms = marks('# Plan\n|next')
    expect(of(ms, 'h1')).toEqual([[0, 0]])
    expect(of(ms, 'hide')).toEqual([[0, 2]])
  })
  it('keep the hashes, dimmed, on the line the caret is in', () => {
    const ms = marks('# Pl|an\nnext')
    expect(of(ms, 'h1')).toEqual([[0, 0]])
    expect(of(ms, 'hide')).toEqual([])
    expect(of(ms, 'marker')).toEqual([[0, 2]])
  })
  it('go to level three; a fourth hash is plain text', () => {
    expect(of(marks('### a\n|'), 'h3')).toEqual([[0, 0]])
    expect(marks('#### a\n|').filter((m) => /^h\d$/.test(m.kind))).toEqual([])
  })
  it('need a space after the hashes', () => {
    expect(marks('#tag\n|')).toEqual([])
  })
})

describe('inline marks', () => {
  it('bold hides its stars away from the caret and keeps the words', () => {
    const ms = marks('a **bold** b\n|')
    expect(of(ms, 'bold')).toEqual([[4, 8]])
    expect(of(ms, 'hide')).toEqual([[2, 4], [8, 10]])
  })
  it('shows the stars dimmed while the caret is on the line', () => {
    const ms = marks('a **bo|ld** b')
    expect(of(ms, 'hide')).toEqual([])
    expect(of(ms, 'marker')).toEqual([[2, 4], [8, 10]])
  })
  it('does italic, inline code and links', () => {
    const ms = marks('*i* `c` [t](http://x)\n|')
    expect(of(ms, 'italic')).toEqual([[1, 2]])
    expect(of(ms, 'code')).toEqual([[5, 6]])
    expect(of(ms, 'link')).toEqual([[9, 10]])
    expect(of(ms, 'hide')).toEqual([[0, 1], [2, 3], [4, 5], [6, 7], [8, 9], [10, 21]])
  })
  it('does not read bold inside inline code', () => {
    expect(of(marks('`**x**`\n|'), 'bold')).toEqual([])
  })
  it('leaves a lone star or a snake_case word alone', () => {
    expect(marks('2 * 3 and a_b_c\n|')).toEqual([])
  })
})

describe('lists and quotes', () => {
  it('draw a dash as a bullet away from the caret, and keep a number', () => {
    const ms = marks('- one\n1. two\n|')
    expect(of(ms, 'bullet')).toEqual([[0, 1]])
    expect(of(ms, 'num')).toEqual([[6, 8]])
  })
  it('keep the dash as typed on the caret line', () => {
    expect(of(marks('- o|ne'), 'bullet')).toEqual([])
  })
  it('make a quote line, hiding the > away from the caret', () => {
    const ms = marks('> said\n|')
    expect(of(ms, 'quote')).toEqual([[0, 0]])
    expect(of(ms, 'hide')).toEqual([[0, 2]])
  })
})

describe('code fences', () => {
  it('shade each line of the block and hide the fences when the caret is outside', () => {
    const ms = marks('```\nls\n```\n|after')
    expect(of(ms, 'codeline')).toEqual([[4, 4]])
    expect(of(ms, 'hide-line')).toEqual([[0, 0], [7, 7]])
  })
  it('keep the fences while the caret is anywhere in the block', () => {
    const ms = marks('```\nl|s\n```\nafter')
    expect(of(ms, 'hide-line')).toEqual([])
    expect(of(ms, 'fence')).toEqual([[0, 0], [7, 7]])
  })
  it('treat an unclosed fence as running to the end', () => {
    const ms = marks('```\nls\n|')
    expect(of(ms, 'codeline').length).toBe(2)
    expect(of(ms, 'hide-line')).toEqual([])
  })
  it('do no inline marks inside', () => {
    expect(of(marks('```\n**x**\n```\n|'), 'bold')).toEqual([])
  })
})

describe('a selection', () => {
  it('shows the marks of every line it touches', () => {
    const ms = marks('|# a\n**b**\nc', 'all')
    expect(of(ms, 'hide')).toEqual([])
  })
})

describe('ordering', () => {
  it('lists marks by position, line marks before the ranges that start there', () => {
    const ms = marks('# a **b**\n|')
    expect(ms.map((m) => m.from)).toEqual([...ms.map((m) => m.from)].sort((a, b) => a - b))
  })
})
