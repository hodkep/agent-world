import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
