import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { changes, commitAll, finishReadiness, discardFile, listFiles, mergeInto, originalContent, pushBranch, readWorktreeFile, writeWorktreeFile } from './gitops'
import { createWorktree } from './worktree'

let tmp: string
let repo: string
let wt: { path: string; branch: string }
const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim()

beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'aw-git-'))
  repo = join(tmp, 'repo')
  mkdirSync(repo)
  git(repo, 'init', '-q', '-b', 'main')
  git(repo, 'config', 'user.email', 't@t')
  git(repo, 'config', 'user.name', 't')
  writeFileSync(join(repo, 'a.ts'), 'one\n')
  writeFileSync(join(repo, 'b.ts'), 'two\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'init')
  wt = await createWorktree({ repoPath: repo, name: 'ada', rootDir: join(tmp, 'wt') })
  git(wt.path, 'config', 'user.email', 't@t')
  git(wt.path, 'config', 'user.name', 't')
})
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

describe('agent changes against its base branch', () => {
  it('lists committed, uncommitted and new files with their status', async () => {
    writeFileSync(join(wt.path, 'a.ts'), 'one changed\n')
    git(wt.path, 'commit', '-qam', 'edit a')
    writeFileSync(join(wt.path, 'b.ts'), 'two changed\n')
    writeFileSync(join(wt.path, 'c.ts'), 'new\n')
    expect(await changes(wt.path, 'main')).toEqual([
      { path: 'a.ts', status: 'modified' },
      { path: 'b.ts', status: 'modified' },
      { path: 'c.ts', status: 'added' }
    ])
  })

  it('reports deletions', async () => {
    rmSync(join(wt.path, 'b.ts'))
    expect(await changes(wt.path, 'main')).toEqual([{ path: 'b.ts', status: 'deleted' }])
  })

  it('gives the base version of a file for the diff, or empty for new files', async () => {
    writeFileSync(join(wt.path, 'a.ts'), 'one changed\n')
    expect(await originalContent(wt.path, 'main', 'a.ts')).toBe('one\n')
    expect(await originalContent(wt.path, 'main', 'nope.ts')).toBe('')
  })
})

describe('editing files in the worktree', () => {
  it('lists tracked and new files, not ignored ones', async () => {
    writeFileSync(join(wt.path, '.gitignore'), 'dist/\n')
    mkdirSync(join(wt.path, 'dist'))
    writeFileSync(join(wt.path, 'dist', 'x.js'), '')
    writeFileSync(join(wt.path, 'new.ts'), '')
    expect(await listFiles(wt.path)).toEqual(['.gitignore', 'a.ts', 'b.ts', 'new.ts'])
  })

  it('reads and writes files inside the worktree', async () => {
    await writeWorktreeFile(wt.path, 'src/x.ts', 'hello\n')
    expect(await readWorktreeFile(wt.path, 'src/x.ts')).toBe('hello\n')
  })

  it('refuses paths that escape the worktree', async () => {
    await expect(readWorktreeFile(wt.path, '../../etc/passwd')).rejects.toThrow(/outside/i)
    await expect(writeWorktreeFile(wt.path, '/tmp/evil', 'x')).rejects.toThrow(/outside/i)
  })
})

describe('landing the work', () => {
  it('commits everything, new files included', async () => {
    writeFileSync(join(wt.path, 'c.ts'), 'new\n')
    await commitAll(wt.path, 'add c')
    expect(git(wt.path, 'status', '--porcelain')).toBe('')
    expect(git(wt.path, 'log', '-1', '--format=%s')).toBe('add c')
  })

  it('refuses an empty commit message or nothing to commit', async () => {
    await expect(commitAll(wt.path, '  ')).rejects.toThrow(/message/i)
    await expect(commitAll(wt.path, 'nothing')).rejects.toThrow(/nothing to commit/i)
  })

  it('discards one file: modified goes back to the last commit, new is deleted', async () => {
    writeFileSync(join(wt.path, 'a.ts'), 'changed\n')
    writeFileSync(join(wt.path, 'c.ts'), 'new\n')
    await discardFile(wt.path, 'a.ts')
    await discardFile(wt.path, 'c.ts')
    expect(readFileSync(join(wt.path, 'a.ts'), 'utf8')).toBe('one\n')
    expect(existsSync(join(wt.path, 'c.ts'))).toBe(false)
  })

  it('merges the agent branch into the base branch of the main checkout', async () => {
    writeFileSync(join(wt.path, 'a.ts'), 'from ada\n')
    await commitAll(wt.path, 'ada work')
    await mergeInto(repo, wt.branch, 'main')
    expect(readFileSync(join(repo, 'a.ts'), 'utf8')).toBe('from ada\n')
  })

  it('will not merge into a checkout with uncommitted work, or one on another branch', async () => {
    writeFileSync(join(wt.path, 'a.ts'), 'from ada\n')
    await commitAll(wt.path, 'ada work')
    writeFileSync(join(repo, 'b.ts'), 'user wip\n')
    await expect(mergeInto(repo, wt.branch, 'main')).rejects.toThrow(/uncommitted/i)
    git(repo, 'checkout', '-q', '--', 'b.ts')
    git(repo, 'checkout', '-qb', 'other')
    await expect(mergeInto(repo, wt.branch, 'main')).rejects.toThrow(/checked out/i)
  })

  it('backs out of a conflicting merge and leaves the checkout clean', async () => {
    writeFileSync(join(wt.path, 'a.ts'), 'from ada\n')
    await commitAll(wt.path, 'ada work')
    writeFileSync(join(repo, 'a.ts'), 'from user\n')
    git(repo, 'commit', '-qam', 'user work')
    await expect(mergeInto(repo, wt.branch, 'main')).rejects.toThrow(/conflict.*a\.ts/i)
    expect(git(repo, 'status', '--porcelain')).toBe('')
    expect(readFileSync(join(repo, 'a.ts'), 'utf8')).toBe('from user\n')
  })

  it('squashes the agent\'s commits into one on the base branch', async () => {
    writeFileSync(join(wt.path, 'a.ts'), 'one\ntwo\n')
    await commitAll(wt.path, 'step 1')
    writeFileSync(join(wt.path, 'a.ts'), 'one\ntwo\nthree\n')
    await commitAll(wt.path, 'step 2')
    await mergeInto(repo, wt.branch, 'main', { squash: true, message: 'Add lines' })
    expect(git(repo, 'log', '--format=%s', 'main').split('\n')).toEqual(['Add lines', 'init'])
    expect(readFileSync(join(repo, 'a.ts'), 'utf8')).toBe('one\ntwo\nthree\n')
  })

  it('backs out of a conflicting squash too', async () => {
    writeFileSync(join(wt.path, 'a.ts'), 'from ada\n')
    await commitAll(wt.path, 'ada work')
    writeFileSync(join(repo, 'a.ts'), 'from user\n')
    git(repo, 'commit', '-qam', 'user work')
    await expect(mergeInto(repo, wt.branch, 'main', { squash: true, message: 'x' })).rejects.toThrow(/conflict.*a\.ts/i)
    expect(git(repo, 'status', '--porcelain')).toBe('')
  })

  it('checks whether the work is ready to land, and says what is in the way', async () => {
    let r = await finishReadiness(repo, wt.path, wt.branch, 'main')
    expect(r).toMatchObject({ ahead: 0, uncommitted: 0, baseReady: true, conflicts: [] })
    writeFileSync(join(wt.path, 'a.ts'), 'from ada\n')
    r = await finishReadiness(repo, wt.path, wt.branch, 'main')
    expect(r.uncommitted).toBe(1)
    await commitAll(wt.path, 'ada work')
    writeFileSync(join(repo, 'a.ts'), 'from user\n')
    git(repo, 'commit', '-qam', 'user work')
    r = await finishReadiness(repo, wt.path, wt.branch, 'main')
    expect(r).toMatchObject({ ahead: 1, uncommitted: 0 })
    expect(r.conflicts).toEqual(['a.ts'])
    git(repo, 'checkout', '-qb', 'other')
    expect((await finishReadiness(repo, wt.path, wt.branch, 'main')).baseReady).toBe(false)
  })

  it('pushes the agent branch to the remote', async () => {
    const remote = join(tmp, 'remote.git')
    git(tmp, 'init', '-q', '--bare', remote)
    git(repo, 'remote', 'add', 'origin', remote)
    writeFileSync(join(wt.path, 'a.ts'), 'from ada\n')
    await commitAll(wt.path, 'ada work')
    await pushBranch(wt.path, wt.branch)
    expect(git(remote, 'log', '-1', '--format=%s', wt.branch)).toBe('ada work')
  })

  it('keeps the .okf spec folder out of the file list and the changes', async () => {
    mkdirSync(join(wt.path, '.okf'))
    writeFileSync(join(wt.path, '.okf', 'spec.md'), '# spec\n')
    writeFileSync(join(wt.path, 'c.ts'), 'three\n')
    expect(await listFiles(wt.path)).toContain('c.ts')
    expect(await listFiles(wt.path)).not.toContain('.okf/spec.md')
    const paths = (await changes(wt.path, 'main')).map((c) => c.path)
    expect(paths).toContain('c.ts')
    expect(paths.some((p) => p.startsWith('.okf'))).toBe(false)
  })
})
