import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { UseLog } from './uses'

let dir: string
let file: string
beforeEach(() => void ((dir = mkdtempSync(join(tmpdir(), 'aw-uselog-'))), (file = join(dir, 'uses.jsonl'))))
afterEach(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))

const use = (id: string) => ({ agent: 'a1', name: 'Ann', provider: 'claude', workspace: 'w', id, how: 'fetched' as const })

describe('the library use log', () => {
  it('is empty with no file, and returns what was added, in order', () => {
    const log = new UseLog(file)
    expect(log.all()).toEqual([])
    log.add(use('one'))
    log.add(use('two'))
    expect(log.all().map((x) => x.id)).toEqual(['one', 'two'])
  })
  it('reads only what was added since it last looked, and still sees what another writer added', () => {
    const log = new UseLog(file)
    log.add(use('one'))
    const first = log.all()
    // The same list while the file is the same.
    expect(log.all()).toBe(first)
    appendFileSync(file, JSON.stringify({ t: 5, ...use('other') }) + '\n')
    log.add(use('three'))
    expect(log.all().map((x) => x.id)).toEqual(['one', 'other', 'three'])
  })
  it('leaves a half-written last line for when it is finished, and starts over when the file shrinks', () => {
    const log = new UseLog(file)
    writeFileSync(file, JSON.stringify({ t: 1, ...use('a') }) + '\n' + '{"t":2,"agent":"a1","na')
    expect(log.all().map((x) => x.id)).toEqual(['a'])
    appendFileSync(file, 'me":"Ann","provider":"claude","workspace":"w","id":"b","how":"fetched"}\n')
    expect(log.all().map((x) => x.id)).toEqual(['a', 'b'])
    writeFileSync(file, JSON.stringify({ t: 9, ...use('z') }) + '\n')
    expect(log.all().map((x) => x.id)).toEqual(['z'])
  })
})
