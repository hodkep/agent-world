import { describe, expect, it } from 'vitest'
import { describeReminder } from './libraryReminder'

describe('the reminder as the Playbook shows it', () => {
  const r = 'Reminder: a (x); b (y). Decide silently which of these apply to this request.'
  it('shows the reminder once, and when it is sent', () => {
    const t = describeReminder(r)
    expect(t.match(/Decide silently/g)).toHaveLength(1)
    expect(t).toContain('Sent with the first message, every sixth one after, after a compaction and after a long pause.')
  })
  it('says nothing when there is no reminder', () => {
    expect(describeReminder('')).toBe('')
  })
})
