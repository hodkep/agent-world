import { describe, expect, it } from 'vitest'
import { WaitNotices } from './waitNotice'

describe('telling an agent a check waits for the person', () => {
  it('says it the first time, and not again while the same check of the same file version still waits', () => {
    const n = new WaitNotices()
    expect(n.firstTime('a1', 'Project check|f2db04f0')).toBe(true)
    expect(n.firstTime('a1', 'Project check|f2db04f0')).toBe(false)
    expect(n.firstTime('a1', 'Project check|f2db04f0')).toBe(false)
  })

  it('says it again for a new version of the file, or another check, since the person has not seen those commands', () => {
    const n = new WaitNotices()
    n.firstTime('a1', 'Project check|v1')
    expect(n.firstTime('a1', 'Project check|v2')).toBe(true)
    expect(n.firstTime('a1', 'Security scan|v2')).toBe(true)
  })

  it('says it again once the person has answered, and keeps each agent apart', () => {
    const n = new WaitNotices()
    n.firstTime('a1', 'Project check|v1')
    expect(n.firstTime('a2', 'Project check|v1')).toBe(true)
    n.answered('a1')
    expect(n.firstTime('a1', 'Project check|v1')).toBe(true)
    expect(n.firstTime('a2', 'Project check|v1')).toBe(false)
  })
})
