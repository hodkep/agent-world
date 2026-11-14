import { describe, expect, it } from 'vitest'
import { deferralCue, isAppLine, isWork, requestTitle, reminderLine, similarLine, trackingCost, trackingHint } from './todoTracking'

describe('trackingHint', () => {
  it('tells an agent in deferred mode to record what is put off, and says nothing about each request', () => {
    const h = trackingHint('deferred')
    expect(h).toMatch(/todo_add/)
    expect(h).toMatch(/put off|defer/i)
    expect(h).not.toMatch(/every request/i)
  })
  it('tells an agent in full mode that the app makes a task for work, a correction or a fix, not for every message, and how to finish it', () => {
    const h = trackingHint('full')
    expect(h).not.toMatch(/Application/)
    expect(h).toMatch(/implementation or research/)
    expect(h).toMatch(/correction/)
    expect(h).toMatch(/todo_done/)
    expect(h).not.toMatch(/every request|each request/i)
    expect(h).toMatch(/parent/)
  })
  it('says a task is done when its change is pushed or tested, not when the code is written', () => {
    const h = trackingHint('full')
    expect(h).toMatch(/pushed/)
    expect(h).toMatch(/tested/)
    expect(h).toMatch(/not when .*written/i)
    expect(h).not.toMatch(/when you finish\b(?! one)/)
  })
  it('stays short, because it is paid for in every session', () => {
    expect(trackingHint('deferred').length).toBeLessThan(820)
    expect(trackingHint('full').length).toBeLessThan(1300)
  })
})

describe('isWork', () => {
  it('is not what the system sent: a background task finishing, a hook note, a command', () => {
    expect(isWork('<task-notification>\n<task-id>x</task-id>\n</task-notification>')).toBe(false)
    expect(isWork('<system-reminder>something the harness added for you to know</system-reminder>')).toBe(false)
    expect(isWork('<local-command-stdout>compacted the conversation</local-command-stdout>')).toBe(false)
  })
  it('is a request with some substance, not a thank-you, a slash command or a one-word answer', () => {
    expect(isWork('please add a health check endpoint to the server')).toBe(true)
    expect(isWork('thanks')).toBe(false)
    expect(isWork('ok, go on')).toBe(false)
    expect(isWork('/clear')).toBe(false)
    expect(isWork('yes')).toBe(false)
    expect(isWork('   ')).toBe(false)
  })
})

describe('isAppLine', () => {
  it('is a line the app wrote into the conversation: a Run press, an approval, a step marked done, a subagent\'s hand-back', () => {
    expect(isAppLine('[Agent World] The person pressed Run: start your step "Commit" now.')).toBe(true)
    expect(isAppLine('[Agent World] Your plan was approved. Go ahead and build it.')).toBe(true)
    expect(isAppLine('[Subagent hand-back] The text below is the final report of a subagent this session delegated to.')).toBe(true)
  })
  it('is not another agent\'s message, which may be a request, nor anything the person typed', () => {
    expect(isAppLine('[Agent World] Message from os: e2e/todo-cards.e2e.ts fails on main, please fix it')).toBe(false)
    expect(isAppLine('please add a health check endpoint to the server')).toBe(false)
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
  it('adds a line only when the message puts something off', () => {
    expect(reminderLine('do the tests later')).toMatch(/todo_add/)
    expect(reminderLine('fix the login bug please')).toBe('')
  })
  it('adds nothing for a plain message: in full mode the app decides in the background and the agent is not asked to name or sort a task', () => {
    expect(reminderLine('fix the login bug please')).toBe('')
    expect(reminderLine('thanks')).toBe('')
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
  it('a git instruction with where and how is still not a task, however many words it takes', () => {
    for (const s of ['Push 10 commits to a separate branch without opening a PR', 'rebase your branch onto origin/main and force push it with lease, no pr', 'pull the latest main and then rebase this branch on it', 'open a PR for this branch against main with the release note', 'push this to fix/terminal-size and tell me the commit hash when it is there']) expect(isWork(s), s).toBe(false)
  })
  it('a git instruction followed by real work is a task', () => {
    for (const s of ['push it, then add a search box to the todo board that filters by agent', 'rebase on main and fix the conflicts in the settings pane by keeping both sides', 'pull main, run the tests, and investigate why the update spec fails']) expect(isWork(s), s).toBe(true)
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

describe('the opening text on lists', () => {
  it('asks for lists by feature, never the app itself or a catch-all', () => {
    expect(trackingHint('full')).toMatch(/by feature/)
    expect(trackingHint('deferred')).toMatch(/by feature/)
    expect(trackingHint('full')).toMatch(/never the app itself/)
  })
})
