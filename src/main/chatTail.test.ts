import { appendFileSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ChatItem } from '../shared/chat'
import { TranscriptTail } from './chatTail'

const user = (uuid: string, text: string) => JSON.stringify({ uuid, type: 'user', timestamp: '2026-01-01T00:00:00Z', message: { role: 'user', content: text } }) + '\n'

let dir: string
beforeEach(() => (dir = mkdtempSync(join(tmpdir(), 'aw-tail-'))))
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('following a transcript file', () => {
  it('reads what is there, then only what is added, waiting for a line to be finished', () => {
    const file = join(dir, 's.jsonl')
    writeFileSync(file, user('a', 'one'))
    const got: ChatItem[] = []
    const tail = new TranscriptTail(file, (items) => got.push(...items))
    tail.poll()
    expect(got.map((i) => i.kind === 'user' && i.text)).toEqual(['one'])

    const second = user('b', 'two')
    appendFileSync(file, second.slice(0, 20)) // half a line
    tail.poll()
    expect(got).toHaveLength(1)
    appendFileSync(file, second.slice(20))
    tail.poll()
    expect(got.map((i) => i.kind === 'user' && i.text)).toEqual(['one', 'two'])
  })

  it('waits for a file that does not exist yet, and starts over if it shrinks', () => {
    const file = join(dir, 'later.jsonl')
    const got: ChatItem[] = []
    const tail = new TranscriptTail(file, (items) => got.push(...items))
    tail.poll()
    expect(got).toEqual([])
    writeFileSync(file, user('a', 'hello') + user('b', 'again'))
    tail.poll()
    expect(got).toHaveLength(2)
    writeFileSync(file, user('c', 'fresh'))
    tail.poll()
    expect(got.at(-1)).toMatchObject({ text: 'fresh' })
  })
})

const node = (uuid: string, parentUuid: string | null, text: string) => JSON.stringify({ uuid, parentUuid, type: 'user', timestamp: '2026-01-01T00:00:00Z', message: { role: 'user', content: text } }) + '\n'
const says = (got: { items: ChatItem[]; replace: boolean }[]) => got.map((g) => `${g.replace ? 'R' : 'A'}:${g.items.map((i) => (i.kind === 'user' ? i.text : i.kind)).join(',')}`)

describe('following the branch you are on', () => {
  it('shows the whole chain as it grows, one addition at a time', () => {
    const file = join(dir, 'tree.jsonl')
    writeFileSync(file, node('a', null, 'one') + node('b', 'a', 'two'))
    const got: { items: ChatItem[]; replace: boolean }[] = []
    const tail = new TranscriptTail(file, (items, replace) => got.push({ items, replace }))
    tail.poll()
    appendFileSync(file, node('c', 'b', 'three'))
    tail.poll()
    expect(says(got)).toEqual(['R:one,two', 'A:three'])
  })

  it('switches to the new branch after a rewind, dropping what was rewound', () => {
    const file = join(dir, 'rewound.jsonl')
    writeFileSync(file, node('a', null, 'keep') + node('b', 'a', 'rewound away') + node('c', 'b', 'also gone'))
    const got: { items: ChatItem[]; replace: boolean }[] = []
    const tail = new TranscriptTail(file, (items, replace) => got.push({ items, replace }))
    tail.poll()
    appendFileSync(file, node('d', 'a', 'new direction'))
    tail.poll()
    expect(says(got)).toEqual(['R:keep,rewound away,also gone', 'R:keep,new direction'])
  })

  it('keeps the whole history across a compact boundary that links back by logicalParentUuid', () => {
    const file = join(dir, 'compact.jsonl')
    const boundary = JSON.stringify({ uuid: 'b', parentUuid: null, logicalParentUuid: 'a', type: 'system', subtype: 'compact_boundary', timestamp: '2026-01-01T00:00:00Z', content: 'Conversation compacted' }) + '\n'
    writeFileSync(file, node('a', null, 'old') + boundary + node('c', 'b', 'after'))
    const got: { items: ChatItem[]; replace: boolean }[] = []
    new TranscriptTail(file, (items, replace) => got.push({ items, replace })).poll()
    expect(says(got)).toEqual(['R:old,note,after'])
  })

  it('leaves transcripts without links between lines alone', () => {
    const file = join(dir, 'flat.jsonl')
    writeFileSync(file, user('x', 'one') + user('y', 'two'))
    const got: { items: ChatItem[]; replace: boolean }[] = []
    new TranscriptTail(file, (items, replace) => got.push({ items, replace })).poll()
    expect(says(got)).toEqual(['R:one,two'])
  })
})

describe('tools called side by side', () => {
  // One reply with several tool calls is saved as a chain of call lines, and each result hangs off its own call.
  const call = (uuid: string, parent: string, id: string, req: string) => JSON.stringify({ uuid, parentUuid: parent, type: 'assistant', timestamp: '2026-01-01T00:00:00Z', requestId: req, message: { id: `m-${req}`, role: 'assistant', content: [{ type: 'tool_use', id, name: 'Agent', input: { description: id } }] } }) + '\n'
  const result = (uuid: string, parent: string, id: string) => JSON.stringify({ uuid, parentUuid: parent, type: 'user', timestamp: '2026-01-01T00:00:01Z', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] } }) + '\n'
  const say = (uuid: string, parent: string, text: string, req: string) => JSON.stringify({ uuid, parentUuid: parent, type: 'assistant', timestamp: '2026-01-01T00:00:02Z', requestId: req, message: { id: `m-${req}`, role: 'assistant', content: [{ type: 'text', text }] } }) + '\n'
  const read = (...lines: string[]) => {
    const file = join(dir, 'p.jsonl')
    writeFileSync(file, lines.join(''))
    let got: ChatItem[] = []
    new TranscriptTail(file, (items, replace) => (got = replace ? items : [...got, ...items])).poll()
    return got
  }
  const parallel = [call('c1', 'u', 'A', 'r1'), call('c2', 'c1', 'B', 'r1'), call('c3', 'c2', 'C', 'r1'), call('c4', 'c3', 'D', 'r1'), result('x1', 'c1', 'A'), result('x2', 'c2', 'B'), result('x3', 'c3', 'C'), result('x4', 'c4', 'D')]

  it('keeps every call and every result, even though the conversation carried on from only one of them', () => {
    const got = read(user('u', 'go'), ...parallel, say('s', 'x3', 'all done', 'r2'))
    expect(got.filter((i) => i.kind === 'tool').map((i) => i.kind === 'tool' && i.toolUseId)).toEqual(['A', 'B', 'C', 'D'])
    expect(got.filter((i) => i.kind === 'tool-result').map((i) => i.kind === 'tool-result' && i.toolUseId)).toEqual(['A', 'B', 'C', 'D'])
    expect(got.at(-1)).toMatchObject({ kind: 'assistant', text: 'all done' })
  })

  it('still drops the calls of an answer that was rewound', () => {
    // The first try (req r1) forked off 'u'; after a rewind the conversation went on from 'u2' with a different reply (r3).
    const got = read(user('u', 'go'), call('c1', 'u', 'A', 'r1'), result('x1', 'c1', 'A'), user('u2', 'try again'), call('n1', 'u2', 'N', 'r3'), result('y1', 'n1', 'N'), say('s', 'y1', 'done', 'r4'))
    expect(got.filter((i) => i.kind === 'tool').map((i) => i.kind === 'tool' && i.toolUseId)).toEqual(['N'])
  })
})

describe('following a transcript file without polling it all the time', () => {
  const until = async (ok: () => boolean, ms = 2000) => {
    for (let t = 0; t < ms && !ok(); t += 25) await new Promise((r) => setTimeout(r, 25))
    return ok()
  }

  it('hears about a new line when the file changes, long before the slow safety check would', async () => {
    const file = join(dir, 'live.jsonl')
    writeFileSync(file, user('a', 'one'))
    const got: ChatItem[] = []
    const tail = new TranscriptTail(file, (items) => got.push(...items))
    tail.start(60_000) // the safety check is a minute away: only a file event can explain what follows
    try {
      await new Promise((r) => setTimeout(r, 400)) // past the moment a new watch needs to become active
      appendFileSync(file, user('b', 'two'))
      expect(await until(() => got.length === 2)).toBe(true)
    } finally {
      tail.stop()
    }
  })

  it('reads what was written in the moment after it started following', async () => {
    const file = join(dir, 'quick.jsonl')
    writeFileSync(file, user('a', 'one'))
    const got: ChatItem[] = []
    const tail = new TranscriptTail(file, (items) => got.push(...items))
    tail.start(60_000)
    try {
      appendFileSync(file, user('b', 'two')) // before the watch is active
      expect(await until(() => got.length === 2)).toBe(true)
    } finally {
      tail.stop()
    }
  })

  it('still finds a file that is only written after it started following', async () => {
    const file = join(dir, 'late.jsonl')
    const got: ChatItem[] = []
    const tail = new TranscriptTail(file, (items) => got.push(...items))
    tail.start(100)
    try {
      writeFileSync(file, user('a', 'hello'))
      expect(await until(() => got.length === 1)).toBe(true)
      appendFileSync(file, user('b', 'there'))
      expect(await until(() => got.length === 2)).toBe(true)
    } finally {
      tail.stop()
    }
  })

  it('keeps following a file that is replaced by a shorter one', async () => {
    const file = join(dir, 'swap.jsonl')
    writeFileSync(file, user('a', 'one') + user('b', 'two') + user('c', 'three'))
    const got: ChatItem[] = []
    const tail = new TranscriptTail(file, (items, replace) => (replace ? (got.length = 0, got.push(...items)) : got.push(...items)))
    tail.start(100)
    try {
      expect(await until(() => got.length === 3)).toBe(true)
      writeFileSync(join(dir, 'new.jsonl'), user('x', 'fresh'))
      renameSync(join(dir, 'new.jsonl'), file) // the file is swapped for a new one
      expect(await until(() => got.some((i) => i.kind === 'user' && i.text === 'fresh'))).toBe(true)
      appendFileSync(file, user('y', 'after'))
      expect(await until(() => got.some((i) => i.kind === 'user' && i.text === 'after'))).toBe(true)
    } finally {
      tail.stop()
    }
  })
})
