import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { claude } from './providers/claude'
import { packagedPath, parseLoginPath } from './appPath'

const FINDER = '/usr/bin:/bin:/usr/sbin:/sbin'

describe('the path of an installed app', () => {
  it('has the folders Claude, Antigravity and Homebrew install into, after the login shell\'s path, whatever started the app', () => {
    const p = packagedPath('/Users/a/bin:/usr/bin', '/Users/a').split(':')
    expect(p.slice(0, 2)).toEqual(['/Users/a/bin', '/usr/bin'])
    expect(p).toEqual(expect.arrayContaining(['/Users/a/.local/bin', '/opt/homebrew/bin', '/usr/local/bin']))
  })
  it('still has the folders when the login shell gave nothing, as on a computer where it could not be asked', () => {
    expect(packagedPath(undefined, '/Users/a')).toBe('/Users/a/.local/bin:/opt/homebrew/bin:/usr/local/bin')
  })
  it('is read from what a login shell printed, between the markers, however noisy its startup files are', () => {
    expect(parseLoginPath('Last login: today\nwelcome!\n__AW__/Users/a/.local/bin:/usr/bin__AW__')).toBe('/Users/a/.local/bin:/usr/bin')
    expect(parseLoginPath('nothing useful')).toBeUndefined()
  })
  it('finds a Claude that is only in ~/.local/bin, from a bare Finder path, with no terminal', async () => {
    const home = mkdtempSync(join(tmpdir(), 'aw-home-'))
    mkdirSync(join(home, '.local', 'bin'), { recursive: true })
    const bin = join(home, '.local', 'bin', 'claude')
    writeFileSync(bin, '#!/bin/sh\necho "2.1.300 (Claude Code)"\n')
    chmodSync(bin, 0o755)
    const run = (name: string, args: string[], path: string) => promisify(execFile)(name, args, { env: { PATH: path } }).then((r) => r.stdout)
    // The bare path alone does not find it...
    expect(await claude.detect('claude', (b, a) => run(b, a, FINDER))).toMatchObject({ state: 'not-installed' })
    // ...and the installed app's path does.
    const path = packagedPath(FINDER, home)
    expect(await claude.detect('claude', (b, a) => run(b, a, path))).toMatchObject({ state: 'ready', version: '2.1.300' })
  })
})
