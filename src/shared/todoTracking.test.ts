import { describe, expect, it } from 'vitest'
import { deferralCue, isWork, requestTitle, reminderLine, similarLine, trackingCost, trackingHint } from './todoTracking'

describe('trackingHint', () => {
  it('tells an agent in deferred mode to record what is put off, and says nothing about each request', () => {
    const h = trackingHint('deferred')
    expect(h).toMatch(/todo_add/)
    expect(h).toMatch(/put off|defer/i)
    expect(h).not.toMatch(/every request/i)
  })
  it('tells an agent in full mode that each request is tracked for it and how to finish it', () => {
    const h = trackingHint('full')
    expect(h).toMatch(/todo_done/)
    expect(h).toMatch(/every request|each request/i)
  })
  it('stays short, because it is paid for in every session', () => {
    expect(trackingHint('deferred').length).toBeLessThan(700)
    expect(trackingHint('full').length).toBeLessThan(820)
  })
})

describe('isWork', () => {
  it('is a request with some substance, not a thank-you, a slash command or a one-word answer', () => {
    expect(isWork('please add a health check endpoint to the server')).toBe(true)
    expect(isWork('thanks')).toBe(false)
    expect(isWork('ok, go on')).toBe(false)
    expect(isWork('/clear')).toBe(false)
    expect(isWork('yes')).toBe(false)
    expect(isWork('   ')).toBe(false)
  })
})

describe('requestTitle', () => {
  it('skips wrapper tags and attached-file lines, and takes the first real line', () => {
    expect(requestTitle('<pasted_content id="7f60">\n@"/tmp/a.png"\n1. SS1 - the history is not needed\n2. more</pasted_content>')).toBe('1. SS1 - the history is not needed')
    expect(requestTitle('<pasted_content id="x">just this</pasted_content>')).toBe('just this')
    expect(requestTitle('@"/a.png" @"/b.png"')).toBe('Request')
  })
  it('is the first line, trimmed to a title', () => {
    expect(requestTitle('  Fix the login bug\nit fails on Safari  ')).toBe('Fix the login bug')
    expect(requestTitle('x'.repeat(300)).length).toBeLessThanOrEqual(120)
  })
})

describe('deferralCue', () => {
  it('notices when the person puts something off', () => {
    for (const s of ['do the tests later', 'skip the docs for now', 'leave that for next time', 'put it on the backlog', 'not now, maybe tomorrow', "let's defer the migration"]) expect(deferralCue(s), s).toBe(true)
    for (const s of ['fix the bug', 'run the tests', 'add a health check to the server']) expect(deferralCue(s), s).toBe(false)
  })
})

describe('reminderLine', () => {
  it('in deferred mode adds a line only when the message puts something off', () => {
    expect(reminderLine('deferred', 'do the tests later')).toMatch(/todo_add/)
    expect(reminderLine('deferred', 'fix the login bug please')).toBe('')
  })
  it('in full mode names the task made for the request and how to close it', () => {
    const l = reminderLine('full', 'fix the login bug please', { id: '12', list: 'Requests' })
    expect(l).toContain('todo#12')
    expect(l).toMatch(/todo_done/)
  })
  it('in full mode says nothing when no task was made (a thank-you)', () => {
    expect(reminderLine('full', 'thanks')).toBe('')
  })
})

describe('trackingCost', () => {
  it('prices deferred mode as only the opening text, and full mode as that plus each request', () => {
    const d = trackingCost('deferred')
    const f = trackingCost('full')
    expect(d.perRequest).toBe(0)
    expect(d.opening).toBeGreaterThan(40)
    expect(f.perRequest).toBeGreaterThan(100)
    expect(f.sessions.map((s) => s.requests)).toEqual([3, 12, 50])
    expect(f.sessions[1]!.tokens).toBe(f.opening + 12 * f.perRequest)
    expect(f.sessions[2]!.tokens).toBeGreaterThan(d.sessions[2]!.tokens)
  })
})

describe('similarLine', () => {
  it('names finished tasks that look like the request, and how to read them, in one short line', () => {
    const l = similarLine([{ id: '12', title: 'Wire the Anthropic key', by: 'ada' }, { id: '15', title: 'Add a test connection', by: 'bob' }])
    expect(l).toContain('todo#12')
    expect(l).toContain('Wire the Anthropic key')
    expect(l).toContain('ada')
    expect(l).toContain('todo#15')
    expect(l).toMatch(/todo_get/)
    expect(l.length).toBeLessThan(400)
  })
  it('says nothing when none look alike', () => {
    expect(similarLine([])).toBe('')
  })
  it('the opening text says to search past tasks', () => {
    expect(trackingHint('deferred')).toMatch(/todo_search/)
    expect(trackingHint('full')).toMatch(/todo_search/)
  })
})
