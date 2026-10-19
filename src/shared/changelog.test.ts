import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { changelogSection } from './changelog'

const SAMPLE = `# Changelog

## [Unreleased]

### Added

- Not out yet.

## [0.2.0] - 2026-10-19

### Added

- Homebrew.

### Fixed

- A bug.

## [0.1.2] - 2026-10-18

### Added

- Updates.

[Unreleased]: ../../compare/v0.2.0...HEAD
`

describe('the notes of one version in the changelog', () => {
  it('are the text under its heading up to the next version, with its date', () => {
    expect(changelogSection(SAMPLE, '0.2.0')).toEqual({ version: '0.2.0', date: '2026-10-19', body: '### Added\n\n- Homebrew.\n\n### Fixed\n\n- A bug.' })
  })
  it('end at the link lines of the last version', () => {
    expect(changelogSection(SAMPLE, '0.1.2')?.body).toBe('### Added\n\n- Updates.')
  })
  it('are null for a version the changelog does not have, for an empty section and for the unreleased one', () => {
    expect(changelogSection(SAMPLE, '9.9.9')).toBeNull()
    expect(changelogSection(SAMPLE, 'Unreleased')).toBeNull()
    expect(changelogSection('## [1.0.0] - 2026-01-01\n\n## [0.9.0] - 2025-01-01\n\n- x\n', '1.0.0')).toBeNull()
  })
  it('is found for a version with a v in front, and is not confused by a version that starts the same', () => {
    expect(changelogSection(SAMPLE, 'v0.2.0')?.date).toBe('2026-10-19')
    expect(changelogSection('## [0.2.10] - 2026-02-02\n\n- ten\n\n## [0.2.1] - 2026-01-01\n\n- one\n', '0.2.1')?.body).toBe('- one')
  })
  it('reads the real CHANGELOG.md of this project for the version in package.json', () => {
    const version = (JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8')) as { version: string }).version
    const found = changelogSection(readFileSync(join(__dirname, '../../CHANGELOG.md'), 'utf8'), version)
    expect(found?.version).toBe(version)
    expect(found?.body.length).toBeGreaterThan(20)
  })
})
