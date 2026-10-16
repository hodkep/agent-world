import { createHash } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error the script is plain JavaScript that runs under Node on its own
import { archiveFor, keyFor, keysToFetch, verifySha256 } from './fetch-git.mjs'
import archives from './git-archives.json'

describe('the git that is bundled with the app', () => {
  it('is pinned for each system the app is built for: an https address and a sha256, from one release', () => {
    for (const key of ['darwin-arm64', 'darwin-x64', 'win32-x64', 'linux-x64']) {
      const a = (archives as Record<string, { url: string; sha256: string }>)[key]!
      expect(a.url, key).toMatch(/^https:\/\/github\.com\/desktop\/dugite-native\/releases\/download\/v[\d.-]+\//)
      expect(a.sha256, key).toMatch(/^[0-9a-f]{64}$/)
    }
    const releases = new Set(Object.values(archives as Record<string, { url: string }>).map((a) => /download\/(v[\d.-]+)\//.exec(a.url)![1]))
    expect(releases.size).toBe(1)
  })
  it('is named by system and kind of processor', () => {
    expect(keyFor('darwin', 'arm64')).toBe('darwin-arm64')
    expect(keyFor('win32', 'x64')).toBe('win32-x64')
    expect(archiveFor('darwin-x64', archives).url).toContain('macOS-x64')
    expect(() => archiveFor('freebsd-x64', archives)).toThrow(/No git is pinned for freebsd-x64/)
  })
  it('is fetched for this computer by default, or for every kind of processor of its system with --platform, or for the ones named', () => {
    expect(keysToFetch([], archives, 'darwin', 'arm64')).toEqual(['darwin-arm64'])
    expect(keysToFetch(['--platform'], archives, 'darwin', 'arm64').sort()).toEqual(['darwin-arm64', 'darwin-x64'])
    expect(keysToFetch(['linux-x64', 'win32-x64'], archives, 'darwin', 'arm64')).toEqual(['linux-x64', 'win32-x64'])
  })
  it('is only used if what was downloaded is what was pinned', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'aw-git-')), 'a.tar.gz')
    writeFileSync(file, 'hello')
    const good = createHash('sha256').update('hello').digest('hex')
    await expect(verifySha256(file, good)).resolves.toBeUndefined()
    await expect(verifySha256(file, '0'.repeat(64))).rejects.toThrow(/Validation failed/)
  })
})
