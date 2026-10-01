import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isOkfPath, okfHint } from './okf'

describe('the .okf spec folder', () => {
  it('recognises its paths and nothing that merely looks like them', () => {
    expect(isOkfPath('.okf')).toBe(true)
    expect(isOkfPath('.okf/spec.md')).toBe(true)
    expect(isOkfPath('.okfx/spec.md')).toBe(false)
    expect(isOkfPath('src/.okf/spec.md')).toBe(false)
  })

  it('tells an agent about it only when the project has one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aw-okf-'))
    expect(okfHint(dir)).toBe('')
    mkdirSync(join(dir, '.okf'))
    const hint = okfHint(dir)
    expect(hint).toContain('.okf/spec.md')
    // One line that points at the file: it says when to open it and never carries its contents.
    expect(hint).toContain('only when the user asks about the product')
    expect(hint).not.toContain('\n')
    expect(hint.length).toBeLessThan(300)
  })
})
