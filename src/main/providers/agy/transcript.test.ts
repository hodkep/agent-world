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
