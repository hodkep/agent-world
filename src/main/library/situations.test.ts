import { describe, expect, it } from 'vitest'
import { checksPassed, detectSituation } from './situations'

const bash = (output: string, command = 'git merge x') => detectSituation('Bash', { command }, { stdout: output, stderr: '' })

describe('detectSituation', () => {
  it('sees a merge conflict in what git printed', () => {
    expect(bash('Auto-merging a.txt\nCONFLICT (content): Merge conflict in a.txt\nAutomatic merge failed; fix conflicts')).toEqual({ kind: 'merge-conflict', detail: '1 file' })
    expect(bash('CONFLICT (content): Merge conflict in a.txt\nCONFLICT (add/add): Merge conflict in b.txt')?.detail).toBe('2 files')
    expect(bash('error: could not apply 1a2b3c4... fix thing', 'git cherry-pick 1a2b3c4')?.kind).toBe('merge-conflict')
    expect(bash('Unmerged paths:\n  both modified:   a.txt', 'git status')?.kind).toBe('merge-conflict')
  })
  it('sees conflict markers in a file the agent printed or searched', () => {
    expect(detectSituation('Read', { file_path: '/p/a.txt' }, 'one\n<<<<<<< HEAD\nx\n=======\ny\n>>>>>>> feature\n')?.kind).toBe('merge-conflict')
  })
  it('stays quiet for ordinary output, including text that only mentions conflicts', () => {
    expect(bash('On branch main\nnothing to commit', 'git status')).toBeNull()
    expect(bash('Already up to date.')).toBeNull()
    expect(detectSituation('Bash', { command: 'echo hi' }, 'a conflict of interest')).toBeNull()
    expect(detectSituation('Bash', { command: 'ls' }, undefined)).toBeNull()
  })
})

describe('failing checks', () => {
  it('sees a failed test run or typecheck in what a command printed', () => {
    expect(bash(' Test Files  1 failed | 3 passed (4)\n      Tests  2 failed | 10 passed (12)', 'pnpm test')).toEqual({ kind: 'failing-checks', detail: 'tests failed' })
    expect(bash("src/a.ts(4,2): error TS2304: Cannot find name 'x'.\nsrc/b.ts(1,1): error TS2322: bad", 'npx tsc --noEmit')).toEqual({ kind: 'failing-checks', detail: '2 type errors' })
    expect(bash('=== 1 failed, 4 passed in 0.3s ===', 'pytest')?.kind).toBe('failing-checks')
    expect(bash('--- FAIL: TestThing (0.00s)\nFAIL', 'go test ./...')?.kind).toBe('failing-checks')
  })
  it('stays quiet for a green run, and for words that only mention failing', () => {
    expect(bash(' Tests  12 passed (12)', 'pnpm test')).toBeNull()
    expect(bash('this test should not fail', 'cat notes.md')).toBeNull()
  })
  it('knows a green run, which ends a streak of failures', () => {
    expect(checksPassed(' Tests  12 passed (12)')).toBe(true)
    expect(checksPassed(' Tests  2 failed | 10 passed (12)')).toBe(false)
    expect(checksPassed('nothing here')).toBe(false)
  })
})
