import { describe, expect, it } from 'vitest'
import { parseTriage, triagePrompt } from './todoTriage'

describe('parseTriage', () => {
  it('reads none, a subtask of a known task and a new task', () => {
    expect(parseTriage('{"action":"none"}', ['4'])).toEqual({ action: 'none' })
    expect(parseTriage('{"action":"subtask","parent":"4","title":"Fix the Safari login bug"}', ['4'])).toEqual({ action: 'subtask', parent: '4', title: 'Fix the Safari login bug' })
    expect(parseTriage('{"action":"new","title":"Add a health check endpoint","list":"Server"}', ['4'])).toEqual({ action: 'new', title: 'Add a health check endpoint', list: 'Server' })
  })

  it('finds the JSON inside what the model wrote around it', () => {
    expect(parseTriage('Sure:\n```json\n{"action":"new","title":"Add a search box"}\n```', [])).toEqual({ action: 'new', title: 'Add a search box' })
  })

  it('reads the kind label, lower case, and drops one that is not a plain word', () => {
    expect(parseTriage('{"action":"new","title":"Add a search box","label":"Feature"}', [])).toEqual({ action: 'new', title: 'Add a search box', label: 'feature' })
    expect(parseTriage('{"action":"subtask","parent":"4","title":"Fix the Safari bug","label":"bug"}', ['4'])).toEqual({ action: 'subtask', parent: '4', title: 'Fix the Safari bug', label: 'bug' })
    expect(parseTriage('{"action":"new","title":"Add a search box","label":"a very long label with spaces in it"}', [])).toEqual({ action: 'new', title: 'Add a search box' })
  })

  it('makes no task when the answer cannot be trusted', () => {
    expect(parseTriage('', ['4'])).toEqual({ action: 'none' })
    expect(parseTriage('no idea', ['4'])).toEqual({ action: 'none' })
    expect(parseTriage('{"action":"maybe"}', ['4'])).toEqual({ action: 'none' })
    // a parent that is not on the board, or a task without a title, is not a task
    expect(parseTriage('{"action":"subtask","parent":"99","title":"Fix it properly"}', ['4'])).toEqual({ action: 'none' })
    expect(parseTriage('{"action":"new","title":"  "}', ['4'])).toEqual({ action: 'none' })
  })

  it('drops a list that says nothing about the area and keeps the title to one short line', () => {
    expect(parseTriage('{"action":"new","title":"Add a search box","list":"Misc"}', [])).toEqual({ action: 'new', title: 'Add a search box' })
    const long = parseTriage(`{"action":"new","title":"${'word '.repeat(60)}"}`, [])
    expect(long.action === 'new' && long.title.length).toBeLessThanOrEqual(100)
  })
})

describe('triagePrompt', () => {
  const base = { message: 'no, it should also work in Safari', current: { id: '4', title: 'Fix the login bug' }, recent: [{ id: '3', title: 'Add the health check', status: 'done' }], lists: ['Library', 'Chat'] }

  it('gives the message, the task in hand, the recent tasks and the lists', () => {
    const p = triagePrompt(base)
    expect(p).toContain('no, it should also work in Safari')
    expect(p).toContain('todo#4')
    expect(p).toContain('Fix the login bug')
    expect(p).toContain('todo#3')
    expect(p).toContain('Library, Chat')
  })

  it('names the open workflow run and clips a long message', () => {
    expect(triagePrompt({ ...base, run: 'Fix the login bug, at the step Build' })).toContain('Fix the login bug, at the step Build')
    expect(triagePrompt({ ...base, message: 'x'.repeat(5000) }).length).toBeLessThan(3000)
  })

  it('gives what the agent last said, clipped, so a short follow-up can be read against it', () => {
    const p = triagePrompt({ ...base, said: 'I added the line to README.md.' })
    expect(p).toContain('The agent last said: I added the line to README.md.')
    expect(triagePrompt({ ...base, said: 'y'.repeat(2000) }).length).toBeLessThan(3000)
    expect(triagePrompt(base)).not.toContain('The agent last said')
  })

  it('names open tasks that look like the message, whoever made them, and asks for a kind label', () => {
    const p = triagePrompt({ ...base, alike: [{ id: '9', title: 'Fix the Safari login redirect' }] })
    expect(p).toContain('Open tasks that look like it: todo#9 "Fix the Safari login redirect"')
    expect(p).toMatch(/label/)
    expect(triagePrompt(base)).not.toContain('Open tasks that look like it')
  })

  it('says so when nothing is in hand', () => {
    expect(triagePrompt({ message: 'build a settings page for the accounts', recent: [], lists: [] })).toContain('no task in hand')
  })
})
