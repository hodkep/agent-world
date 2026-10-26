import { describe, expect, it } from 'vitest'
// @ts-expect-error a plain .mjs script, run by CI
import { onlyVersionChanged, touchesCode } from './ci-changes.mjs'

describe('whether a change needs the end-to-end run', () => {
  it('does not for docs, the changelog, images and licence text', () => {
    expect(touchesCode(['README.md', 'CHANGELOG.md', 'docs/guide/chat-and-dialogs.md', 'docs/images/runs.png', 'LICENSE', 'CONTRIBUTING.md'])).toBe(false)
  })

  it('does for source, tests, config, the lockfile and the workflows themselves', () => {
    for (const f of ['src/renderer/App.tsx', 'e2e/quote.e2e.ts', 'package.json', 'pnpm-lock.yaml', '.github/workflows/ci.yml', 'playwright.config.ts', 'scripts/run-tests.mjs'])
      expect(touchesCode(['README.md', f]), f).toBe(true)
  })

  it('does when nothing is listed, so a failed diff never skips the tests', () => {
    expect(touchesCode([])).toBe(true)
  })

  it('treats an image outside docs as non-code, and a script named like a doc as code', () => {
    expect(touchesCode(['build/icon.png'])).toBe(false)
    expect(touchesCode(['src/renderer/assets/logo.svg'])).toBe(true)
    expect(touchesCode(['scripts/readme-art.mjs'])).toBe(true)
  })
})

describe('a release pull request', () => {
  const pkg = (o: object) => JSON.stringify({ name: 'agent-world', version: '0.4.0', scripts: { test: 'vitest' }, dependencies: { electron: '^40.0.0' }, ...o }, null, 2)

  it('is only a new version when nothing else in package.json differs', () => {
    expect(onlyVersionChanged(pkg({}), pkg({ version: '0.5.0' }))).toBe(true)
    expect(onlyVersionChanged(pkg({}), pkg({}))).toBe(true)
  })

  it('is not when a script, a dependency or any other field changed, even with a new version', () => {
    expect(onlyVersionChanged(pkg({}), pkg({ version: '0.5.0', scripts: { test: 'vitest run' } }))).toBe(false)
    expect(onlyVersionChanged(pkg({}), pkg({ version: '0.5.0', dependencies: { electron: '^41.0.0' } }))).toBe(false)
    expect(onlyVersionChanged(pkg({}), pkg({ description: 'new' }))).toBe(false)
  })

  it('is not when either file cannot be read, so a failure never skips the tests', () => {
    expect(onlyVersionChanged('', pkg({}))).toBe(false)
    expect(onlyVersionChanged(pkg({}), '{ not json')).toBe(false)
  })

  it('does not need the end-to-end run when package.json and the changelog are all that changed and package.json only has a new version', () => {
    expect(touchesCode(['package.json', 'CHANGELOG.md'], { packageVersionOnly: true })).toBe(false)
    expect(touchesCode(['package.json', 'CHANGELOG.md'])).toBe(true)
    expect(touchesCode(['package.json', 'src/main/index.ts'], { packageVersionOnly: true })).toBe(true)
    expect(touchesCode(['package.json', 'pnpm-lock.yaml'], { packageVersionOnly: true })).toBe(true)
  })
})
