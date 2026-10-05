import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AgentRecord } from '../../../shared/types'
import { agyTranscript } from './transcript'
import { msg, str, varint } from './wire.test-helper'

let home: string
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'aw-agy-'))
  mkdirSync(join(home, 'conversations'))
  process.env.AW_AGY_HOME = home
})
afterEach(() => {
  delete process.env.AW_AGY_HOME
  rmSync(home, { recursive: true, force: true })
})

const agent = (sessionId: string): AgentRecord => ({ id: 'a1', name: 'ada', sessionId, repoPath: '/r', cwd: '/w', branch: null, started: true, provider: 'agy' })
const user = (text: string) => Buffer.concat([varint(1, 14), msg(19, str(2, text))])

function conversation(id: string, steps: { type: number; status: number; payload: Buffer }[]) {
  const db = new DatabaseSync(join(home, 'conversations', `${id}.db`))
  db.exec('create table steps (idx integer primary key, step_type integer not null default 0, status integer not null default 0, step_payload blob)')
  const add = db.prepare('insert into steps (idx, step_type, status, step_payload) values (?, ?, ?, ?)')
  steps.forEach((s, i) => add.run(i, s.type, s.status, s.payload))
  db.close()
}

describe('agy conversations', () => {
  it('reads the whole saved conversation', () => {
    conversation('c1', [{ type: 14, status: 3, payload: user('hello') }])
    expect(agyTranscript.readAll(agent('c1')).map((i) => i.kind)).toEqual(['user'])
  })
  it('has nothing for a conversation that is not there yet', () => {
    expect(agyTranscript.readAll(agent('missing'))).toEqual([])
  })
  it('stops at a step still being worked on, so items come in order and none is shown half-done', () => {
    conversation('c2', [
      { type: 14, status: 3, payload: user('one') },
      { type: 14, status: 1, payload: user('two') },
      { type: 14, status: 3, payload: user('three') }
    ])
    expect(agyTranscript.readAll(agent('c2')).map((i) => (i.kind === 'user' ? i.text : ''))).toEqual(['one'])
  })
  it('follows: each poll gives only what is new', () => {
    conversation('c3', [{ type: 14, status: 3, payload: user('one') }])
    const got: string[] = []
    const tail = agyTranscript.follow(agent('c3'), (items) => got.push(...items.map((i) => (i.kind === 'user' ? i.text : ''))))
    tail.poll?.()
    tail.poll?.()
    const db = new DatabaseSync(join(home, 'conversations', 'c3.db'))
    db.prepare('insert into steps (idx, step_type, status, step_payload) values (1, 14, 3, ?)').run(user('two'))
    db.close()
    tail.poll?.()
    tail.stop()
    expect(got).toEqual(['one', 'two'])
  })
})

describe('subagents agy started', () => {
  const at = (sec: number) => msg(5, msg(1, varint(1, sec), varint(2, 0)))
  const tool = (idx: number, call: string, name: string, args: object, result: string) =>
    Buffer.concat([varint(1, 132), msg(5, msg(1, varint(1, 1000 + idx), varint(2, 0)), msg(4, str(1, call), str(2, name), str(3, JSON.stringify(args)))), msg(140, msg(2, str(1, result)))])
  const model = (sec: number, say: string, call?: { id: string; name: string; args: object }) =>
    Buffer.concat([varint(1, 15), at(sec), msg(20, str(1, say), ...(call ? [msg(7, str(1, call.id), str(2, call.name), str(3, JSON.stringify(call.args)))] : []))])

  function parentAndChild(childDone: boolean) {
    const made = 'Created the following subagents:\n{\n  "conversationId":  "child-1",\n  "workspaceUris": []\n}\nThe subagents will send you a message.'
    conversation('parent', [
      { type: 14, status: 3, payload: user('check the folder') },
      { type: 132, status: 3, payload: tool(1, 'call_9', 'invoke_subagent', { Subagents: [{ Prompt: 'List the files and report.', Role: 'File Researcher', TypeName: 'research' }] }, made) }
    ])
    conversation('child-1', [
      { type: 101, status: 3, payload: Buffer.concat([varint(1, 101), at(2000)]) },
      { type: 15, status: 3, payload: model(2001, '', { id: 'c1', name: 'run_command', args: { CommandLine: 'ls -la', toolAction: 'Listing' } }) },
      { type: 132, status: 3, payload: tool(2, 'c1', 'run_command', { CommandLine: 'ls -la' }, 'total 0') },
      ...(childDone ? [{ type: 15, status: 3, payload: model(2003, 'The folder is empty.') }] : [])
    ])
  }

  it('are found from the call that started them, with the conversation each one has of its own', () => {
    parentAndChild(true)
    const [s] = agyTranscript.subagents(agent('parent'))
    expect(s).toMatchObject({ agentId: 'child-1', toolUseId: 'call_9:0', type: 'research', description: 'File Researcher', depth: 1, background: false, spawns: [], stopped: false })
    expect(s!.calls).toEqual([{ at: 1_002_000, name: 'Bash', detail: 'ls -la' }])
  })
  it('are done, with their answer, once they have said it', () => {
    parentAndChild(true)
    expect(agyTranscript.subagents(agent('parent'))[0]).toMatchObject({ done: true, result: 'The folder is empty.' })
  })
  it('are still working while their last step is a call', () => {
    parentAndChild(false)
    expect(agyTranscript.subagents(agent('parent'))[0]).toMatchObject({ done: false, result: '' })
  })
  it('are none for a conversation that started none', () => {
    conversation('plain', [{ type: 14, status: 3, payload: user('hello') }])
    expect(agyTranscript.subagents(agent('plain'))).toEqual([])
    expect(agyTranscript.subagents(agent('missing'))).toEqual([])
  })
})

describe('a conversation rewound to an earlier message', () => {
  it('is shown again from the start with what is left, since agy removes the later steps from the same file', () => {
    conversation('c4', [
      { type: 14, status: 3, payload: user('one') },
      { type: 14, status: 3, payload: user('two') }
    ])
    const calls: { items: string[]; replace: boolean }[] = []
    const tail = agyTranscript.follow(agent('c4'), (items, replace) => calls.push({ items: items.map((i) => (i.kind === 'user' ? i.text : '')), replace }))
    tail.poll?.()
    const db = new DatabaseSync(join(home, 'conversations', 'c4.db'))
    db.exec('delete from steps where idx >= 1')
    db.close()
    tail.poll?.()
    tail.stop()
    expect(calls).toEqual([
      { items: ['one', 'two'], replace: false },
      { items: ['one'], replace: true }
    ])
  })
})

describe('earlier agy conversations in a folder', () => {
  it('are listed from agy history, newest first, titled by the first thing asked', () => {
    conversation('c1', [])
    writeFileSync(
      join(home, 'history.jsonl'),
      [
        { display: 'first ask', timestamp: 1000, workspace: '/proj', conversationId: 'c1' },
        { display: 'later ask', timestamp: 3000, workspace: '/proj', conversationId: 'c1' },
        { display: 'other folder', timestamp: 2000, workspace: '/elsewhere', conversationId: 'c9' },
        { display: 'in a worktree', timestamp: 2500, workspace: '/wt/proj/ada', conversationId: 'c2' }
      ]
        .map((l) => JSON.stringify(l))
        .join('\n') + '\n'
    )
    return agyTranscript.history('/proj', '/wt/proj').then((list) => {
      expect(list.map((s) => [s.id, s.title, s.updated])).toEqual([
        ['c1', 'first ask', 3000],
        ['c2', 'in a worktree', 2500]
      ])
    })
  })
})
