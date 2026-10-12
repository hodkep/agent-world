import { describe, expect, it } from 'vitest'
import { parseTidy, tidyPrompt } from './todoTidy'

describe('tidyPrompt', () => {
  const p = tidyPrompt({ request: 'why is this error shown? its in the CH project', reply: 'The Code panel offered Merge for an agent with no worktree. I made it say so instead.', commits: ['fix: say so in the Code panel when there is no worktree'], lists: ['Application', 'Canvas'] })
  it('gives the request, what the agent said, the commits and the lists to choose from', () => {
    expect(p).toContain('why is this error shown?')
    expect(p).toContain('offered Merge for an agent with no worktree')
    expect(p).toContain('fix: say so in the Code panel')
    expect(p).toContain('Application, Canvas')
  })
  it('asks for a title that says what was done and a list by area, as JSON only, and forbids catch-alls', () => {
    expect(p).toMatch(/JSON/)
    expect(p).toMatch(/title/)
    expect(p).toMatch(/Misc|Other|Requests/)
  })
  it('stays small, since it is paid for on every request', () => {
    expect(p.length).toBeLessThan(2600)
    const long = tidyPrompt({ request: 'x'.repeat(5000), reply: 'y'.repeat(5000), commits: Array.from({ length: 30 }, () => 'z'.repeat(200)), lists: [] })
    expect(long.length).toBeLessThan(3600)
  })
})

describe('parseTidy', () => {
  it('reads the title and list from the model\'s JSON, even with words around it', () => {
    expect(parseTidy('Sure!\n```json\n{"title": "Explain agents with no worktree in the Code panel", "list": "Application"}\n```')).toEqual({ title: 'Explain agents with no worktree in the Code panel', list: 'Application' })
    expect(parseTidy('{"title":"A","list":"Canvas"}')).toEqual({ title: 'A', list: 'Canvas' })
  })
  it('trims and clips', () => {
    const r = parseTidy(JSON.stringify({ title: `  ${'word '.repeat(60)} `, list: '  Library & playbooks  ' }))!
    expect(r.title.length).toBeLessThanOrEqual(100)
    expect(r.list).toBe('Library & playbooks')
  })
  it('refuses a catch-all list, an empty title, and anything that is not JSON', () => {
    expect(parseTidy('{"title":"Did it","list":"Misc"}')).toEqual({ title: 'Did it', list: undefined })
    expect(parseTidy('{"title":"","list":"Canvas"}')).toBeNull()
    expect(parseTidy('I think the title is fine')).toBeNull()
    expect(parseTidy('{"title": 4, "list": "x"}')).toBeNull()
  })
})
