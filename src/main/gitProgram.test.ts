import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { git } from './worktree'
import { gitProcessEnv, useGit } from './gitProgram'

afterEach(() => useGit(null))

/** A stand-in for git: prints what it was asked and the environment it was given. */
function fakeGit(): string {
  const dir = mkdtempSync(join(tmpdir(), 'aw-fakegit-'))
  const bin = join(dir, 'git')
  writeFileSync(bin, '#!/bin/sh\necho "args:$* exec:$GIT_EXEC_PATH"\n')
  chmodSync(bin, 0o755)
  return bin
}

describe('the git the app runs', () => {
  it('is the one it resolved at start, with what that one needs in its environment', async () => {
    useGit({ bin: fakeGit(), source: 'bundled', env: { GIT_EXEC_PATH: '/R/git/libexec/git-core' }, pathDirs: [] })
    expect(await git(tmpdir(), 'status', '-s')).toBe('args:status -s exec:/R/git/libexec/git-core')
  })
  it('never takes the optional locks a status or a diff would, so looking at a repository on a timer cannot make a commit or an add of the person (or an agent) fail with an index.lock', () => {
    expect(gitProcessEnv().GIT_OPTIONAL_LOCKS).toBe('0')
  })
  it('is plain git until one is chosen, with nothing added to the environment', () => {
    expect(gitProcessEnv().GIT_EXEC_PATH).toBe(process.env.GIT_EXEC_PATH)
  })
})
