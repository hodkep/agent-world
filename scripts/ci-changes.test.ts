import { describe, expect, it } from 'vitest'
// @ts-expect-error a plain .mjs script, run by CI
import { touchesCode } from './ci-changes.mjs'

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
