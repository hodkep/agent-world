import { describe, expect, it } from 'vitest'
import { padFromRows, padPlan, padRows } from './todoPad'

describe('padPlan', () => {
  it('turns checklist and plain bullet lines into tasks, in the Inbox unless a heading names a list', () => {
    const p = padPlan('- [ ] first thing\n- second thing\n\n## Chat\n- [ ] third\n* [ ] fourth', ['Library', 'Chat'])
    expect(p.tasks.map((t) => [t.title, t.list, t.done])).toEqual([['first thing', undefined, false], ['second thing', undefined, false], ['third', 'Chat', false], ['fourth', 'Chat', false]])
  })
  it('matches a heading to an existing list however it is written, and keeps a new name as it is', () => {
    const p = padPlan('# library\n- [ ] a\n## Brand new\n- [ ] b', ['Library'])
    expect(p.tasks.map((t) => t.list)).toEqual(['Library', 'Brand new'])
  })
  it('takes an indented line under a task as its notes, and a ticked box as a finished task', () => {
    const p = padPlan('- [ ] write the thing\n  with this detail\n  and that one\n- [x] already done one', [])
    expect(p.tasks[0]).toMatchObject({ title: 'write the thing', notes: 'with this detail\nand that one', done: false })
    expect(p.tasks[1]).toMatchObject({ title: 'already done one', done: true })
  })
  it('leaves what it does not understand, and drops a heading only when nothing is left under it', () => {
    const p = padPlan('## Chat\n- [ ] one\n## Settings\n- [ ] two\nsome half-thought line\n', ['Chat', 'Settings'])
    expect(p.rest).toBe('## Settings\nsome half-thought line\n')
    expect(p.tasks).toHaveLength(2)
  })
  it('finds nothing in an empty pad or plain prose, and ignores empty bullets', () => {
    expect(padPlan('', []).tasks).toEqual([])
    expect(padPlan('just thinking out loud\nno bullets here', []).tasks).toEqual([])
    expect(padPlan('- [ ] \n-\n', []).tasks).toEqual([])
  })
  it('gives back the lines it used, to put back on undo', () => {
    const p = padPlan('- [ ] a\n  note\nkeep\n- [ ] b', [])
    expect(p.used).toBe('- [ ] a\n  note\n- [ ] b')
    expect(p.rest).toBe('keep\n')
  })
})

describe('the pad as rows', () => {
  it('reads every line as a task: bullets with or without a box, headings as the list, and plain lines too', () => {
    const rows = padRows('first\n- [ ] second\n## Chat\n- [x] third\n* fourth\n\n', ['Chat'])
    expect(rows.map((r) => [r.title, r.list, r.done])).toEqual([['first', undefined, false], ['second', undefined, false], ['third', 'Chat', true], ['fourth', 'Chat', false]])
  })
  it('keeps the notes under a task, which the rows do not show', () => {
    expect(padRows('- [ ] a\n  detail one\n  detail two\n- [ ] b', [])[0]).toMatchObject({ title: 'a', notes: 'detail one\ndetail two' })
  })
  it('writes rows as markdown the pad understands, in the order they are, with a heading whenever the list changes, empty rows left out', () => {
    const text = padFromRows([
      { title: 'one', done: false },
      { title: 'two', list: 'Chat', done: false },
      { title: '', done: false },
      { title: 'three', done: true },
      { title: 'four', list: 'Chat', done: true, notes: 'with detail' },
      { title: 'five', list: 'Settings', done: false }
    ])
    expect(text).toBe('- [ ] one\n## Chat\n- [ ] two\n## Inbox\n- [x] three\n## Chat\n- [x] four\n  with detail\n## Settings\n- [ ] five\n')
    // what is written is read back as the same tasks, and as the same tasks by the converter
    expect(padPlan(text, ['Chat', 'Settings']).tasks.map((t) => [t.title, t.list, t.done])).toEqual([['one', undefined, false], ['two', 'Chat', false], ['three', 'Inbox', true], ['four', 'Chat', true], ['five', 'Settings', false]])
    const back = padRows(text, ['Chat', 'Settings'])
    expect(back.map((r) => [r.title, r.list, r.done])).toEqual([['one', undefined, false], ['two', 'Chat', false], ['three', undefined, true], ['four', 'Chat', true], ['five', 'Settings', false]])
  })
  it('keeps a title on one line and writes nothing for no rows', () => {
    expect(padFromRows([{ title: 'a\nb  c', done: false }])).toBe('- [ ] a b c\n')
    expect(padFromRows([])).toBe('')
  })
})
