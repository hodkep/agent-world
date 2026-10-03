import { describe, expect, it } from 'vitest'
import { ancestors, visibleRows } from './tree'

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
