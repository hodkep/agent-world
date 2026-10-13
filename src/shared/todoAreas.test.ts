import { describe, expect, it } from 'vitest'
import { areaOfFiles } from './todoAreas'

describe('areaOfFiles', () => {
  it('names the feature a change belongs to from the folders and file names, not the app', () => {
    expect(areaOfFiles(['src/main/library/service.ts', 'src/main/library/situations.ts', 'e2e/library-situations.e2e.ts'])).toBe('Library')
    expect(areaOfFiles(['src/renderer/panel/LibraryReach.tsx', 'src/renderer/panel/libraryStats.ts'])).toBe('Library')
    expect(areaOfFiles(['src/main/todos/service.ts', 'src/shared/todoTidy.ts', 'src/shared/todos.ts'])).toBe('Todos')
    expect(areaOfFiles(['src/renderer/chat/ChatView.tsx', 'src/renderer/chat/slips.ts'])).toBe('Chat')
    expect(areaOfFiles(['src/main/providers/claude/hookServer.ts', 'src/main/providers/agy/libraryHook.ts'])).toBe('Providers')
    expect(areaOfFiles(['src/renderer/panel/Settings.tsx', 'src/renderer/panel/Setup.tsx', 'src/renderer/panel/Settings.test.tsx'])).toBe('Settings')
  })
  it('takes the area most of the files are in, and ignores tests, styles, docs and shared glue', () => {
    expect(areaOfFiles(['src/main/library/a.ts', 'src/main/library/b.ts', 'src/main/todos/c.ts', 'src/renderer/styles.css', 'src/main/index.ts', 'docs/x.md'])).toBe('Library')
  })
  it('says nothing when the files point to no feature', () => {
    expect(areaOfFiles([])).toBeUndefined()
    expect(areaOfFiles(['src/b.ts', 'src/a.ts'])).toBeUndefined()
    expect(areaOfFiles(['src/main/index.ts', 'src/renderer/styles.css', 'package.json', 'README.md'])).toBeUndefined()
  })
})
