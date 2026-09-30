import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DirtyWorktreeError, createWorktree, isGitRepo, removeWorktree } from './worktree'

let tmp: string
let repo: string
let root: string
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'aw-wt-'))
  repo = join(tmp, 'my-repo')
  root = join(tmp, 'worktrees')
  execFileSync('mkdir', [repo])
  git(repo, 'init', '-q', '-b', 'main')
  git(repo, 'config', 'user.email', 't@t')
  git(repo, 'config', 'user.name', 't')
  writeFileSync(join(repo, 'README.md'), 'hi\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'init')
})
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

describe('worktrees', () => {
  it('detects git repos', async () => {
    expect(await isGitRepo(repo)).toBe(true)
    expect(await isGitRepo(tmp)).toBe(false)
  })

  it('can branch from another agent\'s branch, keeping the same base', async () => {
    const ada = await createWorktree({ repoPath: repo, name: 'ada', rootDir: root })
    writeFileSync(join(ada.path, 'ada.txt'), 'work\n')
    git(ada.path, 'add', '.')
    git(ada.path, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'ada work')
    const twin = await createWorktree({ repoPath: repo, name: 'ada2', rootDir: root, from: ada.branch })
    expect(existsSync(join(twin.path, 'ada.txt'))).toBe(true)
    expect(twin.base).toBe('main')
  })

  it('creates an isolated worktree on aw/<name> outside the repo', async () => {
    const wt = await createWorktree({ repoPath: repo, name: 'ada', rootDir: root })
    expect(wt.branch).toBe('aw/ada')
    expect(wt.base).toBe('main')
    expect(wt.path.startsWith(join(root, 'my-repo-'))).toBe(true)
    expect(existsSync(join(wt.path, 'README.md'))).toBe(true)
    expect(git(wt.path, 'branch', '--show-current')).toBe('aw/ada')
    expect(git(repo, 'status', '--porcelain')).toBe('')
  })

  it('removes a clean worktree but keeps its branch', async () => {
    const wt = await createWorktree({ repoPath: repo, name: 'ada', rootDir: root })
    await removeWorktree({ repoPath: repo, path: wt.path })
    expect(existsSync(wt.path)).toBe(false)
    expect(git(repo, 'branch', '--list', 'aw/ada')).toContain('aw/ada')
  })

  it('refuses to remove a worktree with uncommitted work', async () => {
    const wt = await createWorktree({ repoPath: repo, name: 'ada', rootDir: root })
    writeFileSync(join(wt.path, 'new.txt'), 'wip\n')
    await expect(removeWorktree({ repoPath: repo, path: wt.path })).rejects.toBeInstanceOf(DirtyWorktreeError)
    expect(existsSync(join(wt.path, 'new.txt'))).toBe(true)
  })

  it('discards uncommitted work only when forced', async () => {
    const wt = await createWorktree({ repoPath: repo, name: 'ada', rootDir: root })
    writeFileSync(join(wt.path, 'new.txt'), 'wip\n')
    await removeWorktree({ repoPath: repo, path: wt.path, force: true })
    expect(existsSync(wt.path)).toBe(false)
  })
})
