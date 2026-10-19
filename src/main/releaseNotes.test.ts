import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { installedNotes } from './releaseNotes'

const CHANGELOG = '# Changelog\n\n## [0.3.0] - 2026-11-01\n\n### Added\n\n- A thing.\n\n## [0.2.0] - 2026-10-19\n\n- Older.\n'
const dirWith = (text?: string) => {
  const dir = mkdtempSync(join(tmpdir(), 'aw-notes-'))
  if (text !== undefined) writeFileSync(join(dir, 'CHANGELOG.md'), text)
  return dir
}

describe("the installed version's notes", () => {
  it('come from the first folder that has a changelog', () => {
    expect(installedNotes([dirWith(), dirWith(CHANGELOG)], '0.3.0')).toEqual({ version: '0.3.0', date: '2026-11-01', body: '### Added\n\n- A thing.' })
  })
  it('are null when no folder has a changelog, none has a section for this version, or the file cannot be read', () => {
    expect(installedNotes([dirWith()], '0.3.0')).toBeNull()
    expect(installedNotes([dirWith(CHANGELOG)], '0.4.0')).toBeNull()
    const unreadable = mkdtempSync(join(tmpdir(), 'aw-notes-'))
    mkdirSync(join(unreadable, 'CHANGELOG.md'))
    expect(installedNotes([unreadable], '0.3.0')).toBeNull()
  })
})
