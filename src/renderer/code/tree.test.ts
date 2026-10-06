import { describe, expect, it } from 'vitest'
import { ancestors, visibleRows, changeRows } from './tree'

const files = ['README.md', 'src/main/a.ts', 'src/b.ts', 'docs/x.md', 'zeta.txt']
const names = (r: ReturnType<typeof visibleRows>) => r.map((x) => `${x.depth}:${x.path}${x.dir ? '/' : ''}`)

describe('visibleRows', () => {
  it('lists folders first, then files, hiding the inside of closed folders', () => {
    expect(names(visibleRows(files, new Set(), ''))).toEqual(['0:docs/', '0:src/', '0:README.md', '0:zeta.txt'])
  })

  it('shows the inside of open folders, indented', () => {
    expect(names(visibleRows(files, new Set(['src']), ''))).toEqual(['0:docs/', '0:src/', '1:src/main/', '1:src/b.ts', '0:README.md', '0:zeta.txt'])
  })

  it('a filter keeps matching files and opens the folders that hold them', () => {
    expect(names(visibleRows(files, new Set(), 'A.TS'))).toEqual(['0:src/', '1:src/main/', '2:src/main/a.ts'])
  })

  it('a filter with no match shows nothing', () => {
    expect(visibleRows(files, new Set(), 'nope')).toEqual([])
  })
})

describe('ancestors', () => {
  it('names every folder above a file, outermost first', () => {
    expect(ancestors('src/main/a.ts')).toEqual(['src', 'src/main'])
    expect(ancestors('README.md')).toEqual([])
  })
})

describe('changeRows', () => {
  const paths = ['a/b/c/x.ts', 'a/b/c/y.ts', 'a/b/d/z.ts', 'a/top.ts', 'r.ts']
  const brief = (rows: ReturnType<typeof changeRows>) => rows.map((r) => `${r.depth}${r.dir ? '/' : ' '}${r.name}${r.dir ? ` (${r.count})` : ''}`)
  it('opens every folder, with a folder\'s files counted, folders before files', () => {
    expect(brief(changeRows(paths, new Set(), ''))).toEqual(['0/a (4)', '1/b (3)', '2/c (2)', '3 x.ts', '3 y.ts', '2/d (1)', '3 z.ts', '1 top.ts', '0 r.ts'])
  })
  it('joins a chain of folders that hold nothing else into one row, named by the whole chain and closed by its last folder', () => {
    const rows = changeRows(['p/q/r/f.ts'], new Set(), '')
    expect(brief(rows)).toEqual(['0/p/q/r (1)', '1 f.ts'])
    expect(rows[0]!.path).toBe('p/q/r')
    expect(brief(changeRows(['p/q/r/f.ts'], new Set(['p/q/r']), ''))).toEqual(['0/p/q/r (1)'])
  })
  it('hides what a closed folder holds, and keeps only matching files under a filter', () => {
    expect(brief(changeRows(paths, new Set(['a/b']), ''))).toEqual(['0/a (4)', '1/b (3)', '1 top.ts', '0 r.ts'])
    expect(brief(changeRows(paths, new Set(), 'z.ts'))).toEqual(['0/a/b/d (1)', '1 z.ts'])
  })
})
