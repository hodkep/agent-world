import { describe, expect, it } from 'vitest'
import { describeReminder } from './libraryReminder'

describe('the reminder as the Playbook shows it', () => {
  const r = "Reminder: a (x); b (y). Before your first tool call, write one line: which of these apply to this request?"
  it('shows the reminder once, and names the hard rules that ride on every message', () => {
    const t = describeReminder(r, ['b'])
    expect(t.match(/Before your first tool call/g)).toHaveLength(1)
    expect(t).toContain('Rules marked hard (b) are reminded on every message.')
  })
  it('says it comes only with a pointing message when no rule is hard, and nothing when there is no reminder', () => {
    expect(describeReminder('Reminder: a (x).', [])).toBe('Reminder: a (x). Medium rules are reminded on every third message; soft ones only in the opening text.')
    expect(describeReminder('', [])).toBe('')
  })
})
