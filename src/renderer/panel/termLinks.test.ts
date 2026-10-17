import { describe, expect, it } from 'vitest'
import { findLinks, findWrappedLinks } from './termLinks'

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

describe('findWrappedLinks', () => {
  const url = `https://accounts.example.com/o/oauth2/auth?client_id=${'a'.repeat(60)}&state=xyz`
  it('finds an address the terminal wrapped onto several rows as one whole link, from where it starts to where it ends', () => {
    const cols = 40
    const text = `Open ${url} now`
    const rows = Array.from({ length: Math.ceil(text.length / cols) }, (_, i) => text.slice(i * cols, (i + 1) * cols))
    const [l] = findWrappedLinks(rows, cols, 7)
    expect(l!.target).toBe(url)
    expect(l!.range.start).toEqual({ x: 6, y: 7 })
    const last = 5 + url.length - 1
    expect(l!.range.end).toEqual({ x: (last % cols) + 1, y: 7 + Math.floor(last / cols) })
  })

  it('is the same as findLinks for one row', () => {
    const [l] = findWrappedLinks(['see https://example.com/a now'], 80, 3)
    expect(l!.target).toBe('https://example.com/a')
    expect(l!.range).toEqual({ start: { x: 5, y: 3 }, end: { x: 25, y: 3 } })
  })
})
