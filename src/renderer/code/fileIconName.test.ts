import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fileIconName, ICONS } from './fileIconName'

describe('which icon a file or folder gets', () => {
  it('goes by the extension, whatever the folder or the case', () => {
    expect(fileIconName('api/src/UserService.java')).toBe('java')
    expect(fileIconName('build.PY')).toBe('python')
    expect(fileIconName('a/b/App.tsx')).toBe('react_ts')
    expect(fileIconName('x.ts')).toBe('typescript')
    expect(fileIconName('styles.css')).toBe('css')
  })
  it('goes by the whole name first for the files that are known by it', () => {
    expect(fileIconName('Dockerfile')).toBe('docker')
    expect(fileIconName('web/package.json')).toBe('nodejs')
    expect(fileIconName('README.md')).toBe('readme')
    expect(fileIconName('.gitignore')).toBe('git')
    expect(fileIconName('tsconfig.json')).toBe('tsconfig')
    expect(fileIconName('notes.json')).toBe('json')
  })
  it('gives the plain file icon to a type it does not know, and to a name with no extension', () => {
    expect(fileIconName('thing.zzz')).toBe('file')
    expect(fileIconName('Makefile2')).toBe('file')
    expect(fileIconName('dir.with.dots/noext')).toBe('file')
  })
  it('gives a folder the closed or the open icon', () => {
    expect(fileIconName('src', { dir: true })).toBe('folder')
    expect(fileIconName('src', { dir: true, open: true })).toBe('folder-open')
  })
  it('names only icons that are bundled', () => {
    const have = new Set(readdirSync(join(__dirname, '..', 'assets', 'fileIcons')).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4)))
    for (const n of new Set([...Object.values(ICONS.ext), ...Object.values(ICONS.name), 'file', 'folder', 'folder-open'])) expect(have.has(n), n).toBe(true)
  })
})
