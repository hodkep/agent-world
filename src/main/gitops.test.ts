import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { assertBranch, branches, changes, commitsSince, commitAll, commitDetail, commitDiff, commitStaged, dirtyDiff, history, stage, unstage, worktreeStatus, staleHint, finishReadiness, discardFile, listFiles, mergeInto, originalContent, pushBranch, readWorktreeFile, writeWorktreeFile } from './gitops'
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

describe('the base branch', () => {
  it('lists local and remote branches, leaves out agents\' own, and marks the one the checkout is on', async () => {
    git(repo, 'branch', 'develop')
    const remote = join(tmp, 'remote.git')
    git(tmp, 'init', '-q', '--bare', remote)
    git(repo, 'remote', 'add', 'origin', remote)
    git(repo, 'push', '-q', 'origin', 'develop')
    git(repo, 'fetch', '-q', 'origin')
    const list = await branches(repo)
    expect(list.filter((b) => b.kind === 'local').map((b) => b.name).sort()).toEqual(['develop', 'main'])
    expect(list.filter((b) => b.kind === 'remote').map((b) => b.name)).toEqual(['origin/develop'])
    expect(list.find((b) => b.checkedOut)?.name).toBe('main')
  })
  it('refuses a name that is not a branch', async () => {
    await expect(assertBranch(repo, 'main')).resolves.toBeUndefined()
    await expect(assertBranch(repo, 'nope')).rejects.toThrow('There is no branch called nope')
  })
  it('says when the work is almost the same as what the checkout is on but not as its stored base', async () => {
    git(repo, 'branch', 'old')
    for (let i = 0; i < 12; i++) writeFileSync(join(repo, `n${i}.ts`), 'x\n')
    git(repo, 'add', '.')
    git(repo, 'commit', '-qm', 'more')
    const bob = await createWorktree({ repoPath: repo, name: 'bob', rootDir: join(tmp, 'wt') })
    expect(await changes(bob.path, 'old')).toHaveLength(12)
    expect(await staleHint(repo, bob.path, 'old', 12)).toEqual({ branch: 'main', files: 0 })
    // Compared with the branch the checkout is on, nothing is out of place.
    expect(await staleHint(repo, bob.path, 'main', 0)).toBeNull()
    // A small gap is not worth a note.
    expect(await staleHint(repo, bob.path, 'old', 1)).toBeNull()
  })
  it('starts a new agent from a chosen branch, and that is its base', async () => {
    git(repo, 'branch', 'release')
    writeFileSync(join(repo, 'later.ts'), 'x\n')
    git(repo, 'add', '.')
    git(repo, 'commit', '-qm', 'later')
    const cy = await createWorktree({ repoPath: repo, name: 'cy', rootDir: join(tmp, 'wt'), base: 'release' })
    expect(cy.base).toBe('release')
    expect(existsSync(join(cy.path, 'later.ts'))).toBe(false)
  })
})


describe('what is uncommitted in the worktree, and staging it', () => {
  it('splits staged, changed and new files, and a file edited after staging is in both', async () => {
    writeFileSync(join(wt.path, 'a.ts'), 'one changed\n')
    writeFileSync(join(wt.path, 'new.ts'), 'n\n')
    git(wt.path, 'rm', '-q', 'b.ts')
    git(wt.path, 'add', 'a.ts')
    writeFileSync(join(wt.path, 'a.ts'), 'one changed again\n')
    writeFileSync(join(wt.path, 'loose.ts'), 'l\n')
    const s = await worktreeStatus(wt.path)
    expect(s.staged).toEqual([{ path: 'a.ts', status: 'modified' }, { path: 'b.ts', status: 'deleted' }])
    expect(s.changed).toEqual([{ path: 'a.ts', status: 'modified' }])
    expect(s.untracked).toEqual([{ path: 'loose.ts', status: 'added' }, { path: 'new.ts', status: 'added' }])
  })

  it('is empty when nothing is uncommitted', async () => {
    expect(await worktreeStatus(wt.path)).toEqual({ staged: [], changed: [], untracked: [] })
  })

  it('stages and unstages files, new and deleted ones included', async () => {
    writeFileSync(join(wt.path, 'a.ts'), 'x\n')
    writeFileSync(join(wt.path, 'new.ts'), 'n\n')
    rmSync(join(wt.path, 'b.ts'))
    await stage(wt.path, ['a.ts', 'new.ts', 'b.ts'])
    expect((await worktreeStatus(wt.path)).staged.map((c) => c.path)).toEqual(['a.ts', 'b.ts', 'new.ts'])
    await unstage(wt.path, ['new.ts', 'b.ts'])
    const s = await worktreeStatus(wt.path)
    expect(s.staged.map((c) => c.path)).toEqual(['a.ts'])
    expect(s.untracked.map((c) => c.path)).toEqual(['new.ts'])
    expect(s.changed.map((c) => c.path)).toEqual(['b.ts'])
  })

  it('refuses a path outside the worktree', async () => {
    await expect(stage(wt.path, ['../outside.ts'])).rejects.toThrow(/outside/)
    await expect(unstage(wt.path, ['/etc/passwd'])).rejects.toThrow(/outside/)
  })

  it('commits only what is staged, and says so when nothing is', async () => {
    writeFileSync(join(wt.path, 'a.ts'), 'staged edit\n')
    writeFileSync(join(wt.path, 'b.ts'), 'left alone\n')
    await expect(commitStaged(wt.path, 'nothing yet')).rejects.toThrow(/Nothing is staged/)
    await stage(wt.path, ['a.ts'])
    await expect(commitStaged(wt.path, '  ')).rejects.toThrow(/message/)
    await commitStaged(wt.path, 'edit a')
    expect(git(wt.path, 'log', '-1', '--format=%s')).toBe('edit a')
    expect((await worktreeStatus(wt.path)).changed.map((c) => c.path)).toEqual(['b.ts'])
  })

  it('has the committed version on the left of an uncommitted diff and the file as it is now on the right', async () => {
    writeFileSync(join(wt.path, 'a.ts'), 'now\n')
    expect(await dirtyDiff(wt.path, 'a.ts')).toEqual({ original: 'one\n', current: 'now\n' })
    writeFileSync(join(wt.path, 'fresh.ts'), 'f\n')
    expect(await dirtyDiff(wt.path, 'fresh.ts')).toEqual({ original: '', current: 'f\n' })
    rmSync(join(wt.path, 'b.ts'))
    expect(await dirtyDiff(wt.path, 'b.ts')).toEqual({ original: 'two\n', current: '' })
  })
})

describe('the commits on the active branch', () => {
  const commit = (file: string, body: string, msg: string) => {
    writeFileSync(join(wt.path, file), body)
    git(wt.path, 'add', '-A')
    git(wt.path, 'commit', '-qm', msg)
  }

  it('lists the commits since the base, newest first, with their size, and everything with scope all', async () => {
    commit('a.ts', 'one\nmore\n', 'feat: first')
    commit('c.ts', 'c1\nc2\nc3\n', 'feat: second')
    const own = await history(wt.path, 'main', { scope: 'branch' })
    expect(own.commits.map((c) => c.subject)).toEqual(['feat: second', 'feat: first'])
    expect(own.total).toBe(2)
    expect(own.commits[0]).toMatchObject({ files: 1, added: 3, deleted: 0, head: true, author: 't' })
    expect(own.commits[1]).toMatchObject({ files: 1, added: 1, deleted: 0, head: false })
    expect(own.commits[0]!.hash).toMatch(/^[0-9a-f]{40}$/)
    expect(own.commits[0]!.short).toBe(own.commits[0]!.hash.slice(0, 7))
    expect(own.commits[0]!.at).toBeGreaterThan(Date.now() - 60_000)
    const all = await history(wt.path, 'main', { scope: 'all' })
    expect(all.commits.map((c) => c.subject)).toEqual(['feat: second', 'feat: first', 'init'])
  })

  it('pages through a long branch and searches it by message, author or hash', async () => {
    for (let i = 1; i <= 5; i++) commit(`f${i}.ts`, `${i}\n`, `feat: step ${i}`)
    const first = await history(wt.path, 'main', { scope: 'branch', limit: 2 })
    expect(first.commits.map((c) => c.subject)).toEqual(['feat: step 5', 'feat: step 4'])
    expect(first.more).toBe(true)
    const next = await history(wt.path, 'main', { scope: 'branch', limit: 2, skip: 4 })
    expect(next.commits.map((c) => c.subject)).toEqual(['feat: step 1'])
    expect(next.more).toBe(false)
    expect((await history(wt.path, 'main', { scope: 'branch', search: 'STEP 3' })).commits.map((c) => c.subject)).toEqual(['feat: step 3'])
    expect((await history(wt.path, 'main', { scope: 'branch', search: 'nobody' })).commits).toEqual([])
    const hash = first.commits[1]!.hash
    expect((await history(wt.path, 'main', { scope: 'branch', search: hash.slice(0, 8) })).commits.map((c) => c.subject)).toEqual(['feat: step 4'])
  })

  it('marks the commits not yet pushed when the branch has an upstream, and none when it has not', async () => {
    commit('a.ts', 'two\n', 'feat: one')
    expect((await history(wt.path, 'main', { scope: 'branch' })).commits.map((c) => c.local)).toEqual([false])
    git(wt.path, 'branch', 'origin-copy', 'HEAD')
    git(wt.path, 'branch', '--set-upstream-to=origin-copy')
    commit('b.ts', 'three\n', 'feat: two')
    expect((await history(wt.path, 'main', { scope: 'branch' })).commits.map((c) => c.local)).toEqual([true, false])
  })

  it('tells what one commit changed, and shows each of its files before and after', async () => {
    commit('a.ts', 'one\nmore\n', 'feat: edit\n\nThe body says why.')
    writeFileSync(join(wt.path, 'new.ts'), 'n\n')
    rmSync(join(wt.path, 'b.ts'))
    git(wt.path, 'add', '-A')
    git(wt.path, 'commit', '-qm', 'feat: add and remove')
    const [latest, earlier] = (await history(wt.path, 'main', { scope: 'branch' })).commits
    const d = await commitDetail(wt.path, earlier!.hash)
    expect(d).toMatchObject({ subject: 'feat: edit', body: 'The body says why.', files: [{ path: 'a.ts', status: 'modified' }] })
    expect((await commitDetail(wt.path, latest!.hash)).files).toEqual([{ path: 'b.ts', status: 'deleted' }, { path: 'new.ts', status: 'added' }])
    expect(await commitDiff(wt.path, earlier!.hash, 'a.ts')).toEqual({ original: 'one\n', current: 'one\nmore\n' })
    expect(await commitDiff(wt.path, latest!.hash, 'new.ts')).toEqual({ original: '', current: 'n\n' })
    expect(await commitDiff(wt.path, latest!.hash, 'b.ts')).toEqual({ original: 'two\n', current: '' })
  })

  it('only takes a hash, never an option or a path, for a commit', async () => {
    await expect(commitDetail(wt.path, '--output=/tmp/x')).rejects.toThrow(/commit/)
    await expect(commitDiff(wt.path, 'HEAD; rm -rf', 'a.ts')).rejects.toThrow(/commit/)
  })
})

describe('commits since a time', () => {
  // The setup commit is made just now, so the work is dated later and the time asked about falls between them.
  const later = () => ({ ...process.env, GIT_COMMITTER_DATE: new Date(Date.now() + 30_000).toISOString(), GIT_AUTHOR_DATE: new Date(Date.now() + 30_000).toISOString() })
  const commit = (args: string[]) => execFileSync('git', args, { cwd: wt.path, env: later() })
  it('lists the commits made after it, newest first, with the files they touched, and none before it', async () => {
    const between = Date.now() + 10_000
    writeFileSync(join(wt.path, 'a.ts'), 'one changed\n')
    commit(['commit', '-qam', 'fix: edit a'])
    writeFileSync(join(wt.path, 'c.ts'), 'new\n')
    git(wt.path, 'add', '.')
    commit(['commit', '-qm', 'feat: add c'])
    const got = await commitsSince(wt.path, between)
    expect(got.commits.map((c) => c.subject)).toEqual(['feat: add c', 'fix: edit a'])
    expect(got.commits[0]!.sha).toMatch(/^[0-9a-f]{7,}$/)
    expect(got.files.sort()).toEqual(['a.ts', 'c.ts'])
    expect((await commitsSince(wt.path, Date.now() + 120_000)).commits).toEqual([])
  })
  it('is empty outside a repository', async () => {
    expect(await commitsSince(tmp, 0)).toEqual({ commits: [], files: [] })
  })
})
