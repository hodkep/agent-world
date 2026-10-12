import { describe, expect, it } from 'vitest'
import { detectSituation } from './situations'

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
