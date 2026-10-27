import { describe, expect, it } from 'vitest'
import { childLines, continueList, indentUnder, linkLine, noteLines, notePlan, noteTitle } from './notePlan'

const note = ['# Todos polish', '- [x] Subtasks on the card', '- [ ] Label filter in the bar', '  - [ ] Colour grid like GitLab', '  - [ ] Click outside closes', '* Release notes for `0.5.0`', '', 'Call with the team', '- [ ] Already made (todo#7)'].join('\n')

describe('what a note would make of its lines', () => {
  it('makes a task of each top-level checklist or bullet line, and a subtask of an indented one under it', () => {
    const p = notePlan(note, [])
    expect(p.map((t) => [t.line, t.title, t.done, t.parent])).toEqual([
      [1, 'Subtasks on the card', true, undefined],
      [2, 'Label filter in the bar', false, undefined],
      [3, 'Colour grid like GitLab', false, 2],
      [4, 'Click outside closes', false, 2],
      [5, 'Release notes for `0.5.0`', false, undefined]
    ])
  })
  it('leaves out a line that is already a task, and plain lines and headings', () => {
    expect(notePlan(note, []).some((t) => /Already made/.test(t.title))).toBe(false)
    expect(noteLines(note)[8]).toMatchObject({ todo: '7' })
  })
  it('puts a task in the list a heading above it names, when the board has one', () => {
    expect(notePlan(note, ['Todos polish'])[0]!.list).toBe('Todos polish')
    expect(notePlan(note, ['Other'])[0]!.list).toBeUndefined()
  })
  it('can be limited to some lines, and an indented line picked alone is a task of its own', () => {
    const p = notePlan(note, [], new Set([3]))
    expect(p.map((t) => [t.title, t.parent])).toEqual([['Colour grid like GitLab', undefined]])
  })
})

describe('an item with no words yet', () => {
  it('is an item, so it is drawn with its box, but makes no task', () => {
    const t = '- [ ] one\n- [ ] \n- two'
    expect(noteLines(t)[1]).toMatchObject({ kind: 'item', title: '', done: false })
    expect(notePlan(t, []).map((x) => x.title)).toEqual(['one', 'two'])
  })
})

describe('writing back what became of a line', () => {
  it('adds the task number to the end of the line, once', () => {
    const once = linkLine(note, 2, '12')
    expect(once.split('\n')[2]).toBe('- [ ] Label filter in the bar (todo#12)')
    expect(linkLine(once, 2, '13').split('\n')[2]).toBe('- [ ] Label filter in the bar (todo#12)')
  })
})

describe('the title of a note', () => {
  it('is its first line with the Markdown taken off, or a name for an empty note', () => {
    expect(noteTitle('# Sprint **notes**\nmore')).toBe('Sprint notes')
    expect(noteTitle('- [ ] a task')).toBe('a task')
    expect(noteTitle('\n\n')).toBe('New note')
  })
})

describe('the lines that belong to a line', () => {
  const t = ['- [ ] a', '  - [ ] b', '  - [ ] c', '- [ ] d', '  - [ ] e'].join('\n')
  it('are the indented lines under it, up to the next line that is not indented more', () => {
    expect(childLines(t, 0)).toEqual([1, 2])
    expect(childLines(t, 3)).toEqual([4])
    expect(childLines(t, 1)).toEqual([])
  })
  it('make a line a subtask by indenting it under the item above, if there is one', () => {
    expect(indentUnder(t, 3)!.split('\n')[3]).toBe('  - [ ] d')
    expect(indentUnder(t, 3)!.split('\n')[4]).toBe('    - [ ] e')
    expect(indentUnder(t, 0)).toBeNull()
    expect(indentUnder(t, 1)).toBeNull()
  })
})

describe('pressing Enter in a list', () => {
  it('starts the next line with the same bullet or an empty box, at the same indent', () => {
    const t = '- [x] one\n  - [ ] two'
    expect(continueList(t, t.length)).toEqual({ from: t.length, to: t.length, insert: '\n  - [ ] ' })
    expect(continueList('- one', 5)).toEqual({ from: 5, to: 5, insert: '\n- ' })
    expect(continueList('* [ ] a (todo#3)', 16)).toEqual({ from: 16, to: 16, insert: '\n* [ ] ' })
  })
  it('splits the words when the cursor is in the middle, the rest going on the new item', () => {
    expect(continueList('- [ ] ab cd', 8)).toEqual({ from: 8, to: 8, insert: '\n- [ ] ' })
  })
  it('ends the list on an empty item: the marker goes and the line is empty', () => {
    expect(continueList('- [ ] one\n- [ ] ', 16)).toEqual({ from: 10, to: 16, insert: '' })
    expect(continueList('a\n  - ', 6)).toEqual({ from: 2, to: 6, insert: '' })
  })
  it('leaves other lines, and a cursor before the words, to the editor', () => {
    expect(continueList('plain', 5)).toBeNull()
    expect(continueList('# head', 6)).toBeNull()
    expect(continueList('- [ ] a', 2)).toBeNull()
  })
})

