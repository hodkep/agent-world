import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DirtyWorktreeError, NoCommitsError, attachLeftover, createWorktree, leftoverOf, removeLeftover, slug, checkedOutBranch, hasCommits, isGitRepo, nameTaken, makesBranch, plainGitError, removeWorktree, worktreeFor } from './worktree'
import { repoInfo } from './gitops'

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
afterEach(() => rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))

describe('worktrees', () => {
  it('detects git repos', async () => {
    expect(await isGitRepo(repo)).toBe(true)
    expect(await isGitRepo(tmp)).toBe(false)
  })

  it('knows a name is taken by a branch or worktree left from an earlier agent, even after it was removed', async () => {
    expect(await nameTaken({ repoPath: repo, name: 'ada', rootDir: root })).toBe(false)
    const wt = await createWorktree({ repoPath: repo, name: 'ada', rootDir: root })
    expect(await nameTaken({ repoPath: repo, name: 'ada', rootDir: root })).toBe(true)
    // "Remove, keep worktree" leaves both behind; removing only the folder leaves the branch.
    await removeWorktree({ repoPath: repo, path: wt.path })
    expect(await nameTaken({ repoPath: repo, name: 'ada', rootDir: root })).toBe(true)
    expect(await nameTaken({ repoPath: tmp, name: 'ada', rootDir: root })).toBe(false)
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

describe('a repository with no commits yet', () => {
  let fresh: string
  beforeEach(() => {
    fresh = join(tmp, 'fresh')
    execFileSync('mkdir', [fresh])
    git(fresh, 'init', '-q', '-b', 'main')
  })

  it('is a repository, with no commit to work from', async () => {
    expect(await isGitRepo(fresh)).toBe(true)
    expect(await hasCommits(fresh)).toBe(false)
    expect(await hasCommits(repo)).toBe(true)
    expect(await hasCommits(tmp)).toBe(false)
  })

  it('has no branch to start from, and says so as an empty name instead of a git error', async () => {
    expect(await checkedOutBranch(fresh)).toBe('')
    expect(await checkedOutBranch(repo)).toBe('main')
    expect(await checkedOutBranch(tmp)).toBe('')
  })

  it('cannot have a worktree made, and the reason is in plain words, not a git command', async () => {
    const err = await createWorktree({ repoPath: fresh, name: 'ada', rootDir: root }).then(() => null, (e: Error) => e)
    expect(err).toBeInstanceOf(NoCommitsError)
    expect(err!.message).toBe('This repository has no commits yet, so there is nothing to start a branch from.')
    expect(err!.message).not.toMatch(/Command failed|fatal|HEAD/)
    expect(existsSync(join(root))).toBe(false)
  })

  it('can have one once the first commit is made', async () => {
    writeFileSync(join(fresh, 'a.txt'), 'a\n')
    git(fresh, 'add', '.')
    git(fresh, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'first')
    expect(await hasCommits(fresh)).toBe(true)
    const wt = await createWorktree({ repoPath: fresh, name: 'ada', rootDir: root })
    expect(wt).toMatchObject({ branch: 'aw/ada', base: 'main' })
  })

  it('is described for the hire form: no current branch, no branches, and that it has no commits', async () => {
    expect(await repoInfo(fresh)).toEqual({ current: '', branches: [], unborn: true })
    expect(await repoInfo(tmp)).toEqual({ current: '', branches: [] })
    expect(await repoInfo(repo)).toMatchObject({ current: 'main', branches: [{ name: 'main', kind: 'local', checkedOut: true }] })
    expect((await repoInfo(repo)).unborn).toBeUndefined()
  })
})

describe('what git says when it fails, as a person sees it', () => {
  it('is its own sentence, without the command that was run', () => {
    const raw = new Error("Command failed: /usr/bin/git rev-parse --abbrev-ref HEAD\nfatal: ambiguous argument 'HEAD': unknown revision or path not in the working tree.\nUse '--' to separate paths from revisions")
    expect(plainGitError(raw)).toBe("git said: ambiguous argument 'HEAD': unknown revision or path not in the working tree.")
    expect(plainGitError(new Error('A branch named aw/ada exists.'))).toBe('A branch named aw/ada exists.')
    expect(plainGitError('odd')).toBe('odd')
  })
})

describe('the folder an agent is hired into', () => {
  it('is its own worktree on its own branch in a repository that has commits', async () => {
    const wt = await worktreeFor({ repoPath: repo, name: 'ada', rootDir: root })
    expect(wt).toMatchObject({ branch: 'aw/ada', base: 'main' })
  })
  it('is no worktree, and no branch, when the person asked to work in the folder itself, in a folder that is not a repository, and in a repository with no commits', async () => {
    const fresh = join(tmp, 'fresh')
    execFileSync('mkdir', [fresh])
    git(fresh, 'init', '-q', '-b', 'main')
    expect(await worktreeFor({ repoPath: repo, name: 'ada', rootDir: root, inPlace: true })).toBeNull()
    expect(await worktreeFor({ repoPath: tmp, name: 'ada', rootDir: root })).toBeNull()
    expect(await worktreeFor({ repoPath: fresh, name: 'ada', rootDir: root })).toBeNull()
    expect(git(fresh, 'branch', '--list')).toBe('')
  })
  it('says why in a sentence when git cannot make it, never with the command it ran', async () => {
    const err = await worktreeFor({ repoPath: repo, name: 'ada', rootDir: root, base: 'no-such-branch' }).then(() => null, (e: Error) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err!.message).toMatch(/^git said: /)
    expect(err!.message).not.toMatch(/Command failed|\/usr\/bin\/git/)
  })
})

describe('whether a hire makes a branch', () => {
  it('is only when it gets a worktree: in a repository with commits and not asked to work in the folder, so a left-over aw/<name> blocks nothing else', async () => {
    const fresh = join(tmp, 'fresh')
    execFileSync('mkdir', [fresh])
    git(fresh, 'init', '-q', '-b', 'main')
    expect(await makesBranch({ repoPath: repo })).toBe(true)
    expect(await makesBranch({ repoPath: repo, inPlace: true })).toBe(false)
    expect(await makesBranch({ repoPath: tmp })).toBe(false)
    expect(await makesBranch({ repoPath: fresh })).toBe(false)
  })
})

describe('what an earlier agent left under a name', () => {
  const commit = (cwd: string, file: string) => {
    writeFileSync(join(cwd, file), 'x\n')
    git(cwd, 'add', '.')
    git(cwd, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', file)
  }
  it('is nothing when the name is free', async () => {
    expect(await leftoverOf({ repoPath: repo, name: 'ada', rootDir: root })).toBeNull()
  })
  it('counts the commits not in the base and the files not committed, for a branch with its folder', async () => {
    const wt = await createWorktree({ repoPath: repo, name: 'ada', rootDir: root })
    commit(wt.path, 'a.txt')
    commit(wt.path, 'b.txt')
    writeFileSync(join(wt.path, 'c.txt'), 'loose\n')
    expect(await leftoverOf({ repoPath: repo, name: 'ada', rootDir: root })).toMatchObject({ branch: 'aw/ada', path: wt.path, hasBranch: true, hasFolder: true, registered: true, unmerged: 2, dirty: 1 })
  })
  it('knows a branch whose folder is gone, and a folder git does not know', async () => {
    const wt = await createWorktree({ repoPath: repo, name: 'ada', rootDir: root })
    await removeWorktree({ repoPath: repo, path: wt.path })
    expect(await leftoverOf({ repoPath: repo, name: 'ada', rootDir: root })).toMatchObject({ hasBranch: true, hasFolder: false, registered: false, unmerged: 0 })
    const loose = join(root, slug(repo), 'bo')
    mkdirSync(loose, { recursive: true })
    writeFileSync(join(loose, 'f.txt'), '1')
    expect(await leftoverOf({ repoPath: repo, name: 'bo', rootDir: root })).toMatchObject({ hasBranch: false, hasFolder: true, registered: false, dirty: 1 })
  })
  it('removes the folder and the branch, whatever was unmerged or uncommitted, so the name is free again', async () => {
    const wt = await createWorktree({ repoPath: repo, name: 'ada', rootDir: root })
    commit(wt.path, 'a.txt')
    writeFileSync(join(wt.path, 'c.txt'), 'loose\n')
    await removeLeftover({ repoPath: repo, name: 'ada', rootDir: root })
    expect(await nameTaken({ repoPath: repo, name: 'ada', rootDir: root })).toBe(false)
    expect(existsSync(wt.path)).toBe(false)
    expect(git(repo, 'worktree', 'list')).not.toContain('ada')
    // Removing a leftover that is only a branch, or only a loose folder, works too.
    git(repo, 'branch', 'aw/solo')
    await removeLeftover({ repoPath: repo, name: 'solo', rootDir: root })
    expect(await nameTaken({ repoPath: repo, name: 'solo', rootDir: root })).toBe(false)
  })
  it('attaches a new hire to the branch with its work, with a new folder when the old one is gone', async () => {
    const wt = await createWorktree({ repoPath: repo, name: 'ada', rootDir: root })
    commit(wt.path, 'a.txt')
    const same = await attachLeftover({ repoPath: repo, name: 'ada', rootDir: root })
    expect(same).toEqual({ path: wt.path, branch: 'aw/ada', base: 'main' })
    await removeWorktree({ repoPath: repo, path: wt.path })
    const again = await attachLeftover({ repoPath: repo, name: 'ada', rootDir: root })
    expect(again.path).toBe(wt.path)
    expect(existsSync(join(again.path, 'a.txt'))).toBe(true)
    expect(git(again.path, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('aw/ada')
  })
  it('will not attach to a folder git does not know, or to a name with no branch', async () => {
    await expect(attachLeftover({ repoPath: repo, name: 'ghost', rootDir: root })).rejects.toThrow(/no branch/)
  })
})
