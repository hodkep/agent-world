import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeConfig } from './mcpFile'

let dir: string
beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), 'aw-mf-'))))
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('writing a program\'s own file', () => {
  it('keeps the old text beside it, writes the new whole, keeps the permissions and leaves nothing else behind', () => {
    const f = join(dir, '.claude.json')
    writeFileSync(f, 'old')
    chmodSync(f, 0o640)
    writeConfig(f, 'new')
    expect(readFileSync(f, 'utf8')).toBe('new')
    expect(readFileSync(`${f}.aw-bak`, 'utf8')).toBe('old')
    expect(statSync(f).mode & 0o777).toBe(0o640)
    expect(statSync(`${f}.aw-bak`).mode & 0o777).toBe(0o640)
    expect(existsSync(`${f}.aw-tmp`)).toBe(false)
  })
  it('makes a file that is not there private, with nothing to keep', () => {
    const f = join(dir, 'sub', 'mcp.json')
    writeConfig(f, '{}')
    expect(statSync(f).mode & 0o777).toBe(0o600)
    expect(existsSync(`${f}.aw-bak`)).toBe(false)
  })
  it('writes through a link to the file it points at, and leaves the link a link (a dotfiles manager keeps these)', () => {
    const real = join(dir, 'dotfiles', 'claude.json')
    mkdirSync(join(dir, 'dotfiles'))
    writeFileSync(real, 'old')
    const link = join(dir, '.claude.json')
    symlinkSync(real, link)
    writeConfig(link, 'new')
    expect(lstatSync(link).isSymbolicLink()).toBe(true)
    expect(readlinkSync(link)).toBe(real)
    expect(readFileSync(real, 'utf8')).toBe('new')
    expect(readFileSync(`${real}.aw-bak`, 'utf8')).toBe('old')
  })
})
