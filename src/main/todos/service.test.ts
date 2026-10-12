import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createTodoService } from './service'

const make = () => {
  const dir = mkdtempSync(join(tmpdir(), 'aw-todos-'))
  const changes: string[] = []
  let clock = 1000
  const agents: Record<string, { id: string; name: string; provider: string; repoPath: string }> = {
    a1: { id: 'a1', name: 'ada', provider: 'claude', repoPath: '/work/shop' },
    b1: { id: 'b1', name: 'bob', provider: 'agy', repoPath: '/work/shop' },
    c1: { id: 'c1', name: 'cy', provider: 'claude', repoPath: '/work/other' }
  }
  const svc = createTodoService({
    dir,
    workspaceKey: (p) => p.split('/').pop()!,
    agent: (id) => agents[id],
    lastMessage: (id) => ({ agentId: id, itemId: `m-${id}`, at: clock, excerpt: 'Done: it works' }),
    lastRequest: (id, text) => ({ agentId: id, itemId: `u-${id}`, at: clock, excerpt: text.slice(0, 200) }),
    now: () => (clock += 10),
    onChange: (w) => changes.push(w)
  })
  return { dir, svc, changes }
}

describe('the todo service', () => {
  it('keeps one board per project and saves it to a file that survives a restart', () => {
    const { dir, svc } = make()
    svc.addByAgent('a1', { title: 'Add key', list: 'Manual setup', needsYou: true })
    svc.addByAgent('c1', { title: 'Other project' })
    expect(svc.board('/work/shop').todos.map((t) => t.title)).toEqual(['Add key'])
    expect(svc.board('/work/other').todos.map((t) => t.title)).toEqual(['Other project'])
    expect(readdirSync(dir).sort()).toEqual(['other.json', 'shop.json'])
    const again = createTodoService({ dir, workspaceKey: (p) => p.split('/').pop()!, agent: () => undefined, lastMessage: () => undefined, lastRequest: () => undefined, now: () => 1, onChange: () => undefined })
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
