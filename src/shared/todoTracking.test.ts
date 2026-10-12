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
    expect(trackingHint('deferred').length).toBeLessThan(820)
    expect(trackingHint('full').length).toBeLessThan(940)
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
    expect(requestTitle('x'.repeat(300)).length).toBeLessThanOrEqual(81)
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
    const l = reminderLine('full', 'fix the login bug please', { id: '12', list: 'Inbox' }, ['Application', 'Canvas'])
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

describe('what is not a task', () => {
  it('an approval or a go-ahead is not a request', () => {
    for (const s of ['these are good, lets implement these.', 'looks good to me, thanks a lot', 'yes please go ahead with that', 'not yet', 'that works, continue please']) expect(isWork(s), s).toBe(false)
  })
  it('a plain git instruction is not a task', () => {
    for (const s of ['commit those and merge to main', 'please merge your changes in main', 'commit and add to main', 'push it to origin', 'lets merge to main']) expect(isWork(s), s).toBe(false)
  })
  it('an approval with a real request after it is one', () => {
    expect(isWork('not yet, I want this to act as a knowledge base of what is done and how')).toBe(true)
    expect(isWork('commit this, then add a search box to the todo board that filters by agent')).toBe(true)
  })
})

describe('requestTitle, made readable', () => {
  it('leaves out quoted lines and takes your own words', () => {
    expect(requestTitle('> should the wall bookshelf open a new panel (my suggestion)\n\nyes, a panel, and show the shelves as tabs')).toBe('a panel, and show the shelves as tabs')
  })
  it('drops a leading approval and filler', () => {
    expect(requestTitle('not yet, I want this to act as a knowledge base')).toBe('I want this to act as a knowledge base')
    expect(requestTitle('please can you add a health check endpoint')).toBe('add a health check endpoint')
  })
  it('ends at a sentence or a word, never in the middle of one', () => {
    expect(requestTitle('Why is this error shown? its in the CH project open in this app')).toBe('Why is this error shown?')
    const t = requestTitle('word '.repeat(60))
    expect(t.length).toBeLessThanOrEqual(81)
    expect(t.endsWith('…')).toBe(true)
    expect(t).not.toMatch(/wor…$/)
  })
})

describe('asking the agent to name and sort the task', () => {
  const l = reminderLine('full', 'fix the login bug please', { id: '12', list: 'Inbox' }, ['Application', 'Canvas'])
  it('says to name it and which lists exist, and to make a new one only when none fits', () => {
    expect(l).toContain('todo_update')
    expect(l).toContain('Application, Canvas')
    expect(l).toMatch(/title/)
    expect(l).toMatch(/none fits|no list fits/i)
  })
  it('with no lists yet says to name an area', () => {
    expect(reminderLine('full', 'fix the login bug please', { id: '12', list: 'Inbox' }, [])).toMatch(/area/)
  })
  it('names at most eight lists, so the line stays short', () => {
    const many = Array.from({ length: 12 }, (_, i) => `Area${i}`)
    expect(reminderLine('full', 'x y z w', { id: '1', list: 'Inbox' }, many)).not.toContain('Area9')
  })
  it('the opening text asks for a few lists by area, never a catch-all', () => {
    expect(trackingHint('full')).toMatch(/by area/)
    expect(trackingHint('deferred')).toMatch(/by area/)
  })
})
