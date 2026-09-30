import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { saveAttachment } from './attachments'

let dir: string
beforeEach(() => (dir = mkdtempSync(join(tmpdir(), 'aw-att-'))))
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('saving attachments', () => {
  it('writes the bytes under the agent\'s folder and returns the path', () => {
    const path = saveAttachment(dir, 'agent-1', 'shot.png', new Uint8Array([1, 2, 3]))
    expect(path.startsWith(join(dir, 'agent-1'))).toBe(true)
    expect(path.endsWith('shot.png')).toBe(true)
    expect([...readFileSync(path)]).toEqual([1, 2, 3])
    expect(statSync(path).mode & 0o077).toBe(0)
  })

  it('cleans awkward names and never leaves the folder', () => {
    const path = saveAttachment(dir, 'agent-1', '../../etc/pass wd?.PNG', new Uint8Array([1]))
    expect(path.startsWith(join(dir, 'agent-1') + '/')).toBe(true)
    expect(path).not.toContain('..')
    expect(path).not.toContain('?')
  })

  it('names a pasted picture that has no name', () => {
    expect(saveAttachment(dir, 'agent-1', '', new Uint8Array([1]), 'image/png').endsWith('.png')).toBe(true)
  })

  it('refuses executable-looking types and huge files', () => {
    expect(() => saveAttachment(dir, 'a', 'run.sh', new Uint8Array([1]))).toThrow(/type/i)
    expect(() => saveAttachment(dir, 'a', 'big.png', new Uint8Array(26 * 1024 * 1024))).toThrow(/large/i)
  })
})
