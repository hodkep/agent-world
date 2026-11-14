import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (f: string) => readFileSync(resolve(__dirname, '..', f), 'utf8')
const builder = read('electron-builder.yml')
const mac = builder.slice(builder.indexOf('\nmac:'), builder.indexOf('\ndmg:'))

describe('what the Mac build produces', () => {
  it('is a dmg to install from and a zip for the updater, for both kinds of Mac', () => {
    expect(mac).toMatch(/target: dmg, arch: \[arm64, x64\]/)
    // electron-updater on macOS installs the zip that latest-mac.yml points at.
    expect(mac).toMatch(/target: zip, arch: \[arm64, x64\]/)
  })
  it('is signed ad hoc unless the release workflow gives it a Developer ID', () => {
    expect(mac).toMatch(/identity: "-"/)
  })
})

describe('what the app does with the logins it keeps', () => {
  // The Preview keeps logins for thirty days; with the fuse on, Electron stores their values encrypted (the key is in the Keychain), not as plain text a process of the person's could read.
  it('has the cookie encryption fuse switched on in every build', () => {
    const lines = builder.split('\n')
    const at = lines.indexOf('electronFuses:')
    // The block is the indented lines right under the key, up to the next key at the left edge.
    const end = lines.findIndex((l, i) => i > at && l !== '' && !l.startsWith(' '))
    const body = lines.slice(at + 1, end < 0 ? undefined : end)
    expect(at).toBeGreaterThanOrEqual(0)
    expect(body.map((l) => l.trim())).toContain('enableCookieEncryption: true')
  })
})

describe('what the installers are called', () => {
  it('has no space in the name, so the file on GitHub, the one a build makes and the one the docs name are the same, and so is each blockmap', () => {
    const name = /^artifactName:\s*"?([^"\n]+)"?\s*$/m.exec(builder)?.[1]
    expect(name).toBe('Agent-World-${version}-${arch}.${ext}')
    expect(name).not.toMatch(/\s/)
  })
})

describe('what the installers carry for the license', () => {
  // Apache 2.0 section 4: whoever receives the app also receives a copy of the license, and the NOTICE file.
  const top = /^extraResources:\n((?:[ ]+- .*\n)+)/m.exec(builder)?.[1] ?? ''
  it('puts LICENSE and NOTICE in the app, whatever the system', () => {
    expect(top).toMatch(/- LICENSE\b/)
    expect(top).toMatch(/- NOTICE\b/)
  })
  it("puts CHANGELOG.md in the app, which is where the installed version's What's new is read from", () => {
    expect(top).toMatch(/- CHANGELOG\.md\b/)
  })
})

