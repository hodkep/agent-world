import { describe, expect, it } from 'vitest'
import { findLinks } from './termLinks'

describe('findLinks', () => {
  it('finds web addresses, leaving off the punctuation that ends a sentence', () => {
    const [l] = findLinks('see https://example.com/a?b=1, then go')
    expect(l).toMatchObject({ kind: 'url', target: 'https://example.com/a?b=1', start: 4 })
    expect(findLinks('(http://localhost:5173/).')[0]!.target).toBe('http://localhost:5173/')
  })

  it('finds file paths with a line and column, as compilers and test runners print them', () => {
    expect(findLinks('src/main/index.ts:42:7 error')[0]).toMatchObject({ kind: 'file', target: 'src/main/index.ts', line: 42, col: 7, start: 0, end: 22 })
    expect(findLinks('at ./a/b.test.tsx:9')[0]).toMatchObject({ target: './a/b.test.tsx', line: 9 })
    expect(findLinks('/Users/me/proj/README.md')[0]).toMatchObject({ kind: 'file', target: '/Users/me/proj/README.md' })
  })

  it('does not take ordinary words, version numbers or the middle of a web address for files', () => {
    expect(findLinks('e.g. version 1.2.3 and hello.world')).toEqual([])
    expect(findLinks('https://example.com/a/b.html')).toHaveLength(1)
    expect(findLinks('https://example.com/a/b.html')[0]!.kind).toBe('url')
  })

  it('finds several on one line, in order', () => {
    expect(findLinks('a.ts:1 https://x.io b/c.py').map((l) => l.target)).toEqual(['a.ts', 'https://x.io', 'b/c.py'])
  })
})
