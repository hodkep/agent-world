import { describe, expect, it } from 'vitest'
import { fileGroups } from './skillFiles'

describe("a skill's files, by folder", () => {
  it('keeps the files at the top first, then a group for each folder with its count and tokens, biggest first', () => {
    const files = ['tests.md', 'scripts/a.mjs', 'scripts/lib/b.mjs', 'data/x.csv', 'mocking.md']
    const sizes = { 'tests.md': 554, 'scripts/a.mjs': 100, 'scripts/lib/b.mjs': 50, 'data/x.csv': 900, 'mocking.md': 371 }
    expect(fileGroups(files, sizes)).toEqual([
      { folder: '', files: [{ path: 'mocking.md', name: 'mocking.md', tokens: 371 }, { path: 'tests.md', name: 'tests.md', tokens: 554 }], tokens: 925 },
      { folder: 'data', files: [{ path: 'data/x.csv', name: 'x.csv', tokens: 900 }], tokens: 900 },
      { folder: 'scripts', files: [{ path: 'scripts/a.mjs', name: 'a.mjs', tokens: 100 }, { path: 'scripts/lib/b.mjs', name: 'lib/b.mjs', tokens: 50 }], tokens: 150 }
    ])
  })

  it('has no top group when every file is in a folder, and leaves a size it does not know out', () => {
    expect(fileGroups(['refs/a.md'], {})).toEqual([{ folder: 'refs', files: [{ path: 'refs/a.md', name: 'a.md', tokens: undefined }], tokens: 0 }])
  })
})
