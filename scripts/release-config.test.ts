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
})

