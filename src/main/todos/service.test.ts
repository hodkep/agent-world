import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createTodoService } from './service'

const make = () => {
  const dir = mkdtempSync(join(tmpdir(), 'aw-todos-'))
  const changes: string[] = []
  const worked: number[] = []
  const remembered: { repo: string; text: string; by: string }[] = []
  let clock = 1000
  const agents: Record<string, { id: string; name: string; provider: string; repoPath: string; forMain?: string }> = {
    a1: { id: 'a1', name: 'ada', provider: 'claude', repoPath: '/work/shop' },
    b1: { id: 'b1', name: 'bob', provider: 'agy', repoPath: '/work/shop' },
    c1: { id: 'c1', name: 'cy', provider: 'claude', repoPath: '/work/other' },
    h1: { id: 'h1', name: 'helper', provider: 'agy', repoPath: '/work/shop', forMain: 'ada' }
  }
  const svc = createTodoService({
    dir,
    workspaceKey: (p) => p.split('/').pop()!,
    agent: (id) => agents[id],
    lastMessage: (id) => ({ agentId: id, itemId: `m-${id}`, at: clock, excerpt: 'Done: it works' }),
    workSince: async (_id, since) => { worked.push(since); return { commits: [{ sha: 'abc1234def', subject: 'fix: wire the key' }], files: ['src/b.ts'] } },
    remember: (repo, text, by) => void remembered.push({ repo, text, by }),
    lastRequest: (id, text) => ({ agentId: id, itemId: `u-${id}`, at: clock, excerpt: text.slice(0, 200) }),
    now: () => (clock += 10),
    onChange: (w) => changes.push(w)
  })
  return { dir, svc, changes, worked, remembered }
}

describe('the todo service', () => {
  it('keeps one board per project and saves it to a file that survives a restart', () => {
    const { dir, svc } = make()
    svc.addByAgent('a1', { title: 'Add key', list: 'Manual setup', needsYou: true })
    svc.addByAgent('c1', { title: 'Other project' })
    expect(svc.board('/work/shop').todos.map((t) => t.title)).toEqual(['Add key'])
    expect(svc.board('/work/other').todos.map((t) => t.title)).toEqual(['Other project'])
    expect(readdirSync(dir).sort()).toEqual(['other.json', 'shop.json'])
    const again = createTodoService({ dir, workspaceKey: (p) => p.split('/').pop()!, agent: () => undefined, lastMessage: () => undefined, lastRequest: () => undefined, workSince: async () => ({ commits: [], files: [] }), remember: () => undefined, now: () => 1, onChange: () => undefined })
    expect(again.board('/work/shop').todos[0]).toMatchObject({ title: 'Add key', createdBy: { name: 'ada', provider: 'claude' } })
    expect(JSON.parse(readFileSync(join(dir, 'shop.json'), 'utf8')).next).toBe(2)
  })

  it('stamps an agent\'s add and finish with who made the call and the message it was in', () => {
    const { svc } = make()
    const t = svc.addByAgent('a1', { title: 'Wire the key' })
    expect(t.createdLink).toMatchObject({ agentId: 'a1', itemId: 'm-a1', excerpt: 'Done: it works' })
    svc.doneByAgent('a1', t.id, 'wired')
    expect(svc.board('/work/shop').todos[0]).toMatchObject({ status: 'done', doneBy: { id: 'a1', name: 'ada' }, doneNote: 'wired', doneLink: { itemId: 'm-a1' } })
  })

  it('lets the person add, tick, move and clear lists, recorded as them', () => {
    const { svc, changes } = make()
    svc.addList('/work/shop', 'Tools')
    const t = svc.addByPerson('/work/shop', { title: 'By hand', list: 'Tools' })
    expect(t.createdBy).toEqual({ kind: 'human', name: 'you' })
    svc.doneByPerson('/work/shop', t.id)
    expect(svc.board('/work/shop').todos[0]).toMatchObject({ status: 'done', doneBy: { kind: 'human' } })
    expect(svc.board('/work/shop').todos[0]!.doneLink).toBeUndefined()
    svc.reopenByPerson('/work/shop', t.id)
    svc.moveByPerson('/work/shop', t.id, 'Release', 0)
    expect(svc.board('/work/shop').lists).toEqual(['Tools', 'Release'])
    expect(changes.length).toBeGreaterThan(4)
  })

  it('lists what an agent asks for: open ones, one list, or its own', () => {
    const { svc } = make()
    svc.addByAgent('a1', { title: 'one', list: 'Tools' })
    const two = svc.addByAgent('a1', { title: 'two', list: 'Setup' })
    svc.claimByAgent('b1', two.id)
    const d = svc.addByAgent('a1', { title: 'three', list: 'Tools' })
    svc.doneByAgent('a1', d.id, '')
    expect(svc.listForAgent('a1', {}).map((t) => t.title)).toEqual(['one', 'two'])
    expect(svc.listForAgent('a1', { list: 'Tools' }).map((t) => t.title)).toEqual(['one'])
    expect(svc.listForAgent('b1', { mine: true }).map((t) => t.title)).toEqual(['two'])
    expect(svc.listForAgent('a1', { status: 'done' }).map((t) => t.title)).toEqual(['three'])
  })

  it('does not let one agent reach another project\'s board, and refuses an unknown caller', () => {
    const { svc } = make()
    const t = svc.addByAgent('a1', { title: 'shop task' })
    expect(() => svc.doneByAgent('c1', t.id, '')).toThrow(/No todo/)
    expect(() => svc.addByAgent('nobody', { title: 'x' })).toThrow(/agent/i)
  })

  it('makes a task for a request the person sent, claimed by the agent, and flags it when the turn ends unfinished', () => {
    const { svc } = make()
    const t = svc.trackRequest('a1', 'please fix the login bug on Safari')
    expect(t).toMatchObject({ title: 'please fix the login bug on Safari', list: 'Requests', status: 'doing', auto: true, createdBy: { kind: 'human' }, claimedBy: { id: 'a1' } })
    expect(t!.createdLink).toMatchObject({ agentId: 'a1' })
    svc.turnEnded('a1')
    expect(svc.board('/work/shop').todos[0]!.stale).toBe(true)
    svc.doneByAgent('a1', t!.id, 'fixed')
    svc.turnEnded('a1')
    expect(svc.board('/work/shop').todos[0]!.stale).toBeUndefined()
  })

  it('does not make a task for small talk, and finishes the one it made when the agent says so', () => {
    const { svc } = make()
    expect(svc.trackRequest('a1', 'thanks')).toBeUndefined()
    expect(svc.board('/work/shop').todos).toEqual([])
  })

  it('says which main agent a subagent works for, on what it adds and finishes', () => {
    const { svc } = make()
    const t = svc.addByAgent('h1', { title: 'Found a flaky test' })
    expect(t.createdBy).toMatchObject({ name: 'helper', provider: 'agy', forMain: 'ada' })
    svc.doneByAgent('h1', t.id, 'fixed')
    expect(svc.board('/work/shop').todos[0]!.doneBy).toMatchObject({ forMain: 'ada' })
  })

  it('puts an agent on a task at the person\'s request, or records a question to it, and gives back the message to send', () => {
    const { svc } = make()
    const t = svc.addByPerson('/work/shop', { title: 'Write the docs', list: 'Docs', notes: 'screenshot needed' })
    const work = svc.askAgent('/work/shop', t.id, 'b1', 'work', 'start with Settings')
    expect(work.message).toContain('todo#1')
    expect(work.message).toContain('start with Settings')
    expect(svc.board('/work/shop').todos[0]).toMatchObject({ status: 'doing', claimedBy: { id: 'b1', name: 'bob' } })
    const q = svc.askAgent('/work/shop', t.id, 'a1', 'ask', 'is it needed?')
    expect(q.message).toMatch(/question/i)
    expect(svc.board('/work/shop').todos[0]!.claimedBy).toMatchObject({ id: 'b1' })
    expect(svc.board('/work/shop').todos[0]!.history.at(-1)).toMatchObject({ what: 'asked', note: 'ada: is it needed?' })
    expect(() => svc.askAgent('/work/shop', t.id, 'a1', 'work', '')).toThrow(/bob is already doing/)
    expect(() => svc.askAgent('/work/shop', t.id, 'nobody', 'ask', '')).toThrow(/agent/i)
  })

  it('keeps how a task was done, adds the commits git shows since it was claimed, and writes it to the shared memory', async () => {
    const { svc, worked, remembered } = make()
    const t = svc.addByAgent('a1', { title: 'Wire the key' })
    svc.claimByAgent('a1', t.id)
    svc.doneByAgent('a1', t.id, 'Key wired', { how: 'Passed it to the client.', files: ['src/a.ts'] })
    expect(svc.board('/work/shop').todos[0]).toMatchObject({ status: 'done', doneHow: 'Passed it to the client.', doneFiles: ['src/a.ts'] })
    await svc.settled()
    const done = svc.board('/work/shop').todos[0]!
    expect(done.doneCommits).toEqual([{ sha: 'abc1234def', subject: 'fix: wire the key' }])
    expect(done.doneFiles).toEqual(['src/a.ts', 'src/b.ts'])
    expect(worked).toHaveLength(1)
    expect(worked[0]).toBeGreaterThan(1000)
    expect(remembered).toHaveLength(1)
    expect(remembered[0]).toMatchObject({ repo: '/work/shop', by: 'ada' })
    expect(remembered[0]!.text).toContain('todo#1')
    expect(remembered[0]!.text).toContain('Passed it to the client.')
    expect(remembered[0]!.text).toContain('abc1234')
  })

  it('writes no memory for a task finished with nothing to say, and survives git failing', async () => {
    const { svc, remembered, dir } = make()
    const quiet = createTodoService({ dir, workspaceKey: (p) => p.split('/').pop()!, agent: () => ({ id: 'a1', name: 'ada', provider: 'claude', repoPath: '/work/quiet' }), lastMessage: () => undefined, lastRequest: () => undefined, workSince: async () => { throw new Error('not a repo') }, remember: (r, t, b) => void remembered.push({ repo: r, text: t, by: b }), now: () => 5, onChange: () => undefined })
    const t = quiet.addByAgent('a1', { title: 'Plain' })
    quiet.doneByAgent('a1', t.id, '')
    await quiet.settled()
    expect(quiet.board('/work/quiet').todos[0]).toMatchObject({ status: 'done' })
    expect(remembered).toHaveLength(0)
    void svc
  })

  it('searches the project\'s tasks for an agent, done ones included', async () => {
    const { svc } = make()
    const a = svc.addByAgent('a1', { title: 'Fix the flaky login test' })
    svc.doneByAgent('a1', a.id, 'Waited for the cookie banner', { how: 'Detach before click' })
    svc.addByAgent('a1', { title: 'Write the changelog' })
    await svc.settled()
    expect(svc.searchForAgent('b1', 'cookie banner', {}).map((h) => h.todo.id)).toEqual([a.id])
    expect(svc.searchForAgent('c1', 'cookie banner', {})).toEqual([])
  })

  it('points an agent at a finished task that looks like its request, once in a while, never at itself', async () => {
    const { svc } = make()
    const a = svc.addByAgent('a1', { title: 'Wire the Anthropic key into the Settings accounts page' })
    svc.doneByAgent('a1', a.id, 'Added the key field and a test connection', { how: 'Settings → Accounts' })
    await svc.settled()
    const first = svc.similarDone('b1', 'please wire the anthropic key into settings accounts')
    expect(first.map((h) => h.id)).toEqual([a.id])
    expect(svc.similarDone('b1', 'please wire the anthropic key into settings accounts')).toEqual([])
    expect(svc.similarDone('b1', 'rename the lamp post')).toEqual([])
    expect(svc.similarDone('c1', 'wire the anthropic key into settings accounts')).toEqual([])
  })

  it('counts what needs the person, per project', () => {
    const { svc } = make()
    svc.addByAgent('a1', { title: 'key', needsYou: true })
    svc.addByAgent('a1', { title: 'other' })
    expect(svc.needsYou('/work/shop')).toBe(1)
    expect(svc.needsYou('/work/other')).toBe(0)
  })

  it('survives a damaged file by starting an empty board rather than failing', () => {
    const { dir, svc } = make()
    writeFileSync(join(dir, 'shop.json'), '{not json')
    expect(svc.board('/work/shop')).toMatchObject({ lists: [], todos: [] })
  })
})
