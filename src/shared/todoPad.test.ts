import { describe, expect, it } from 'vitest'
import { padPlan } from './todoPad'

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
