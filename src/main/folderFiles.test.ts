import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { listFolderFiles } from './folderFiles'

const make = (files: string[]) => {
  const dir = mkdtempSync(join(tmpdir(), 'aw-folder-'))
  for (const f of files) {
    mkdirSync(join(dir, f, '..'), { recursive: true })
    writeFileSync(join(dir, f), 'x')
  }
  return dir
}

describe('the files of a folder that is not a git repository', () => {
  it('lists every file with its path from the folder, sorted, folders and all', async () => {
    const dir = make(['b.txt', 'a/z.md', 'a/b/c.py', 'notes.md'])
    expect(await listFolderFiles(dir)).toEqual(['a/b/c.py', 'a/z.md', 'b.txt', 'notes.md'])
  })

  it('leaves out what nobody edits by hand: .git, node_modules, build output, caches, virtual environments and .DS_Store', async () => {
    const dir = make(['src/app.ts', '.git/config', 'node_modules/x/index.js', 'dist/out.js', 'build/o.js', '.venv/bin/py', '__pycache__/m.pyc', 'src/.DS_Store', '.env', '.gitignore'])
    expect(await listFolderFiles(dir)).toEqual(['.env', '.gitignore', 'src/app.ts'])
  })

  it('stops at the limit and says the list was cut, so a huge folder never freezes the panel', async () => {
    const dir = make(Array.from({ length: 12 }, (_, i) => `f${String(i).padStart(2, '0')}.txt`))
    const r = await listFolderFiles(dir, { limit: 5, withCut: true })
    expect(r.files).toHaveLength(5)
    expect(r.cut).toBe(true)
    expect((await listFolderFiles(dir, { limit: 50, withCut: true })).cut).toBe(false)
  })

  it('does not follow a link out of the folder or round in a circle, and an unreadable or missing folder is an empty list', async () => {
    const dir = make(['a/x.txt'])
    symlinkSync(dir, join(dir, 'a', 'loop'))
    symlinkSync('/etc', join(dir, 'etc-link'))
    expect(await listFolderFiles(dir)).toEqual(['a/x.txt'])
    expect(await listFolderFiles(join(dir, 'nope'))).toEqual([])
  })
})
