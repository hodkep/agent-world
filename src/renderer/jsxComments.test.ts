import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : f.endsWith('.tsx') ? [join(dir, f)] : []))

/** A `//` line straight after a JSX tag is not a comment: it is drawn as text in the page. */
describe('comments in JSX', () => {
  it('no line of JSX starts with //', () => {
    const stray = files(__dirname).flatMap((f) => {
      const lines = readFileSync(f, 'utf8').split('\n')
      return lines.flatMap((l, i) => (/^\s*\/\/ /.test(l) && /(^|[^=\-/])>\s*$/.test(lines[i - 1] ?? '') && !/(=>|[a-z)\]]\s*>)\s*$/.test(lines[i - 1] ?? '') ? [`${f}:${i + 1}`] : []))
    })
    expect(stray).toEqual([])
  })
})
