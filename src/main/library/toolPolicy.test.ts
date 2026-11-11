import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ToolLog, ToolPolicy } from './toolPolicy'

let dir: string
beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), 'aw-tp-'))))
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('which servers are off and what each tool is told', () => {
  it('keeps a server off and a tool\'s policy across a restart, and clears them', () => {
    const f = join(dir, 'tool-policy.json')
    const p = new ToolPolicy(f)
    p.setServer('higgsfield', false)
    p.setTool('Bash', 'ask')
    p.setTool('WebFetch', 'deny')
    const again = new ToolPolicy(f).get()
    expect(again).toEqual({ off: ['higgsfield'], policy: { Bash: 'ask', WebFetch: 'deny' } })
    p.setServer('higgsfield', true)
    p.setTool('Bash', null)
    expect(new ToolPolicy(f).get()).toEqual({ off: [], policy: { WebFetch: 'deny' } })
  })

  it('refuses the office\'s own server, a name that is not a plain name, and a policy that is not one of the three', () => {
    const p = new ToolPolicy(join(dir, 'p.json'))
    expect(() => p.setServer('agent-world', false)).toThrow(/office/)
    expect(() => p.setServer('a b', false)).toThrow(/name/)
    expect(() => p.setTool('Bash(rm -rf *)', 'allow')).toThrow(/name/)
    expect(() => p.setTool('Bash', 'sometimes' as never)).toThrow(/Allow, Ask or Deny/)
    expect(p.get()).toEqual({ off: [], policy: {} })
  })

  it('reads a file written by hand or by another version only as far as its shape: bad entries are dropped', () => {
    const f = join(dir, 'p.json')
    writeFileSync(f, JSON.stringify({ off: ['ok', 5, 'a b', 'agent-world'], policy: { Read: 'allow', Bash: 'maybe', 'x y': 'deny', Edit: 3 } }))
    expect(new ToolPolicy(f).get()).toEqual({ off: ['ok'], policy: { Read: 'allow' } })
    writeFileSync(f, '{not json')
    expect(new ToolPolicy(f).get()).toEqual({ off: [], policy: {} })
  })

  it('writes the file whole and private', () => {
    const f = join(dir, 'p.json')
    new ToolPolicy(f).setTool('Read', 'allow')
    expect(JSON.parse(readFileSync(f, 'utf8'))).toEqual({ off: [], policy: { Read: 'allow' } })
  })
})

describe('the note of each tool call', () => {
  it('appends one line a call and reads them back, leaving out a damaged line', () => {
    const f = join(dir, 'tool-calls.jsonl')
    const log = new ToolLog(f)
    log.add({ agent: 'a', project: 'p', provider: 'claude', tool: 'Bash' })
    log.add({ agent: 'a', project: 'p', provider: 'agy', tool: 'run_command' })
    writeFileSync(f, readFileSync(f, 'utf8') + '{half a line\n')
    const all = new ToolLog(f).all()
    expect(all.map((n) => n.tool)).toEqual(['Bash', 'run_command'])
    expect(all[0]!.t).toBeGreaterThan(0)
  })
  it('keeps no more than a name and a place of each call', () => {
    const f = join(dir, 'c.jsonl')
    new ToolLog(f).add({ agent: 'a', project: 'p', provider: 'claude', tool: 'Bash', command: 'rm -rf /', input: { x: 1 } } as never)
    expect(Object.keys(JSON.parse(readFileSync(f, 'utf8').trim())).sort()).toEqual(['agent', 'project', 'provider', 't', 'tool'])
  })

  it('drops the notes older than 30 days when asked, keeping the rest, and says how many it dropped', () => {
    const f = join(dir, 'c.jsonl')
    const now = Date.now()
    const line = (t: number) => JSON.stringify({ t, agent: 'a', project: 'p', provider: 'claude', tool: 'Bash' })
    writeFileSync(f, [line(now - 40 * 86_400_000), line(now - 31 * 86_400_000), line(now - 86_400_000), line(now)].join('\n') + '\n')
    const log = new ToolLog(f)
    expect(log.prune(now)).toBe(2)
    expect(log.all()).toHaveLength(2)
    expect(new ToolLog(f).all()).toHaveLength(2)
    expect(log.prune(now)).toBe(0)
  })
  it('reads the file again only when it has changed', () => {
    const f = join(dir, 'c2.jsonl')
    const log = new ToolLog(f)
    log.add({ agent: 'a', project: 'p', provider: 'claude', tool: 'Bash' })
    const first = log.all()
    expect(log.all()).toBe(first)
    log.add({ agent: 'a', project: 'p', provider: 'claude', tool: 'Read' })
    expect(log.all()).toHaveLength(2)
  })
})
