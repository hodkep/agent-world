import { describe, expect, it } from 'vitest'
import { agyArgs, agyModes, parseUsage } from './launch'

const agent = { id: 'a1', name: 'ada', sessionId: 'conv-1', repoPath: '/r', cwd: '/w', branch: null, started: false }

describe('starting agy', () => {
  it('starts fresh with no conversation, and resumes the one it has once it started', () => {
    expect(agyArgs({ agent, files: {} })).toEqual([])
    expect(agyArgs({ agent: { ...agent, started: true }, files: {} })).toEqual(['--conversation', 'conv-1'])
  })
  it('passes the model, effort and extra folders', () => {
    expect(agyArgs({ agent, files: {}, options: { model: 'gemini-3.1-pro-high', effort: 'high' }, addDirs: ['/a', '/b'] })).toEqual(['--model', 'gemini-3.1-pro-high', '--effort', 'high', '--add-dir', '/a', '--add-dir', '/b'])
  })
  it('maps how much it may do alone to its own switches', () => {
    expect(agyArgs({ agent, files: {}, options: { permissionMode: 'accept-edits' as never } })).toEqual(['--mode', 'accept-edits'])
    expect(agyArgs({ agent, files: {}, options: { permissionMode: 'plan' } })).toEqual(['--mode', 'plan'])
    expect(agyArgs({ agent, files: {}, options: { permissionMode: 'skip-permissions' as never } })).toEqual(['--dangerously-skip-permissions'])
    expect(agyArgs({ agent, files: {}, options: { permissionMode: 'request-review' as never } })).toEqual([])
  })
  it('sends the house rules and the job as its first message, only on the first start', () => {
    const first = agyArgs({ agent, files: {}, houseRules: 'Small commits.', options: { instructions: 'Review only.' } })
    expect(first[0]).toBe('-i')
    expect(first[1]).toContain('Small commits.')
    expect(first[1]).toContain('Review only.')
    expect(agyArgs({ agent: { ...agent, started: true }, files: {}, houseRules: 'Small commits.' })).toEqual(['--conversation', 'conv-1'])
  })
})

describe('agy modes', () => {
  it('are the four levels, named the way the screens already name them', () => {
    expect(agyModes.map((m) => m.id)).toEqual(['request-review', 'accept-edits', 'plan', 'skip-permissions'])
    expect(agyModes[0]!.label).toBe('Ask first')
  })
})

describe('reading /usage', () => {
  const out = 'Gemini Models\tWeekly Limit Remaining\t100%\t2026-10-12T06:23:31Z\nGemini Models\tFive Hour Limit Remaining\t42%\t2026-10-05T16:23:31Z\nClaude and GPT models\tFive Hour Limit Remaining\t100%\t2026-10-05T16:30:41Z\n'
  it('gives each window with its remaining share and reset time', () => {
    expect(parseUsage(out)).toEqual([
      { provider: 'agy', group: 'Gemini Models', kind: 'weekly', remainingPct: 100, resetsAt: '2026-10-12T06:23:31Z' },
      { provider: 'agy', group: 'Gemini Models', kind: 'five_hour', remainingPct: 42, resetsAt: '2026-10-05T16:23:31Z' },
      { provider: 'agy', group: 'Claude and GPT models', kind: 'five_hour', remainingPct: 100, resetsAt: '2026-10-05T16:30:41Z' }
    ])
  })
  it('ignores lines that are not limits', () => {
    expect(parseUsage('Fetching…\nsomething else\n')).toEqual([])
  })
})
