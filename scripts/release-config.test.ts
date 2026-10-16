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
