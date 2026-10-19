import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { assertBranch, branchDiff, branches, changes, commitsSince, uncommittedFiles, commitAll, commitDetail, commitDiff, commitStaged, dirtyDiff, history, clampPage, inPlaceHistory, placeOf, stage, unstage, worktreeStatus, staleHint, finishReadiness, discardFile, listFiles, mergeInto, originalContent, pushBranch, readWorktreeFile, writeWorktreeFile } from './gitops'
import { createWorktree } from './worktree'
import { useGit } from './gitProgram'
import { chmodSync } from 'node:fs'

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

  it('does not count the plan file the plan gate asks for as work, and does not commit it with the work', async () => {
    mkdirSync(join(wt.path, '.agent-world'))
    writeFileSync(join(wt.path, '.agent-world', 'plan.md'), '## Goal\nx\n')
    expect((await finishReadiness(repo, wt.path, wt.branch, 'main')).uncommitted).toBe(0)
    await expect(commitAll(wt.path, 'nothing but the plan')).rejects.toThrow('Nothing to commit.')
    writeFileSync(join(wt.path, 'c.ts'), 'three\n')
    expect((await finishReadiness(repo, wt.path, wt.branch, 'main')).uncommitted).toBe(1)
    await commitAll(wt.path, 'the work')
    expect(git(wt.path, 'show', '--name-only', '--format=', 'HEAD')).toBe('c.ts')
    expect((await finishReadiness(repo, wt.path, wt.branch, 'main')).uncommitted).toBe(0)
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
  it('lists the files with changes not yet committed, edited or new, and none outside a repository', async () => {
    writeFileSync(join(wt.path, 'a.ts'), 'edited again\n')
    writeFileSync(join(wt.path, 'brand-new.ts'), 'new\n')
    expect((await uncommittedFiles(wt.path)).sort()).toEqual(['a.ts', 'brand-new.ts'])
    expect(await uncommittedFiles(tmp)).toEqual([])
  })
})

describe('the diff an auditor reads', () => {
  it('is what the branch adds to its base, without plan files or uncommitted edits', async () => {
    writeFileSync(join(wt.path, 'a.ts'), 'one changed\n')
    mkdirSync(join(wt.path, '.agent-world'))
    writeFileSync(join(wt.path, '.agent-world', 'plan.md'), '# plan\n')
    git(wt.path, 'add', '-A')
    git(wt.path, 'commit', '-qm', 'edit a')
    writeFileSync(join(wt.path, 'b.ts'), 'not committed\n')
    const diff = await branchDiff(wt.path, 'main', wt.branch)
    expect(diff).toContain('diff --git a/a.ts b/a.ts')
    expect(diff).toContain('+one changed')
    expect(diff).not.toContain('plan.md')
    expect(diff).not.toContain('b.ts')
  })
})

describe('the commits made in a folder since an agent was hired into it', () => {
  it('lists only those after the time, newest first, and counts them', async () => {
    const commit = (name: string, date: string) => {
      writeFileSync(join(repo, name), name)
      git(repo, 'add', '.')
      execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', `feat: ${name}`], { cwd: repo, env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } })
    }
    commit('old.txt', '2020-01-01T00:00:00Z')
    commit('one.txt', '2030-01-01T00:00:00Z')
    commit('two.txt', '2030-01-02T00:00:00Z')
    const page = await history(repo, '', { scope: 'branch', since: Date.parse('2029-01-01T00:00:00Z') })
    expect(page.commits.map((c) => c.subject)).toEqual(['feat: two.txt', 'feat: one.txt'])
    expect(page.total).toBe(2)
    expect((await history(repo, '', { scope: 'branch', since: Date.parse('2031-01-01T00:00:00Z') })).commits).toEqual([])
  })
})

describe('every look the app takes at a repository goes through the chosen git without optional locks', () => {
  afterEach(() => useGit(null))
  it('reads status, history, a diff and a commit with GIT_OPTIONAL_LOCKS=0 and the chosen program, never a bare git', async () => {
    const seen = join(tmp, 'seen.log')
    const bin = join(tmp, 'recording-git')
    writeFileSync(bin, `#!/bin/sh\necho "$GIT_OPTIONAL_LOCKS $1" >> '${seen}'\nexec git "$@"\n`)
    chmodSync(bin, 0o755)
    useGit({ bin, source: 'bundled', env: {}, pathDirs: [] })
    writeFileSync(join(wt.path, 'a.ts'), 'changed\n')
    await worktreeStatus(wt.path)
    await history(wt.path, 'main', { scope: 'all' })
    await dirtyDiff(wt.path, 'a.ts')
    const hash = git(wt.path, 'rev-parse', 'HEAD')
    await commitDiff(wt.path, hash, 'a.ts')
    await changes(wt.path, 'main')
    const lines = readFileSync(seen, 'utf8').trim().split('\n')
    // status, log, rev-list... and the `show` calls (one for dirtyDiff, two for the commit) all went through it, every one told not to lock.
    expect(lines.some((l) => l.endsWith(' status'))).toBe(true)
    expect(lines.filter((l) => l.endsWith(' show')).length).toBe(3)
    expect(lines.every((l) => l.startsWith('0 '))).toBe(true)
  })
})

describe('the commits of an agent working in the folder itself', () => {
  const at = (iso: string) => ({ ...process.env, GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso })
  const commit = (name: string, iso: string, author = 't') => {
    writeFileSync(join(repo, name), name)
    git(repo, 'add', '.')
    execFileSync('git', ['-c', 'user.email=t@t', '-c', `user.name=${author}`, 'commit', '-qm', `feat: ${name}`], { cwd: repo, env: at(iso) })
  }
  it('are all of the folder\'s, newest first, with how many were made since the agent was hired, so the list can say where it started', async () => {
    commit('old.txt', '2020-01-01T00:00:00Z')
    commit('one.txt', '2030-01-01T00:00:00Z')
    commit('two.txt', '2030-01-02T00:00:00Z')
    const hired = Date.parse('2029-01-01T00:00:00Z')
    const page = await inPlaceHistory(repo, { scope: 'branch' }, hired)
    expect(page.commits.map((c) => c.subject)).toEqual(['feat: two.txt', 'feat: one.txt', 'feat: old.txt', 'init'])
    expect(page.total).toBe(4)
    expect(page.sinceHire).toEqual({ at: hired, count: 2 })
    expect((await inPlaceHistory(repo, { scope: 'branch' }, Date.parse('2031-01-01T00:00:00Z'))).sinceHire).toEqual({ at: Date.parse('2031-01-01T00:00:00Z'), count: 0 })
  })
  it('say nothing of a hire time when none is on record (an older agent), and still show every commit', async () => {
    commit('a.txt', '2030-01-01T00:00:00Z')
    const page = await inPlaceHistory(repo, { scope: 'branch' })
    expect(page.commits.map((c) => c.subject)).toEqual(['feat: a.txt', 'init'])
    expect('sinceHire' in page).toBe(false)
  })
  it('are read one page at a time, never all at once: a page, whether more follow, and the total from a count', async () => {
    for (let i = 1; i <= 5; i++) commit(`f${i}.txt`, `2030-01-0${i}T00:00:00Z`)
    const first = await inPlaceHistory(repo, { scope: 'branch', limit: 2 }, 0)
    expect(first.commits.map((c) => c.subject)).toEqual(['feat: f5.txt', 'feat: f4.txt'])
    expect(first).toMatchObject({ total: 6, more: true })
    const last = await inPlaceHistory(repo, { scope: 'branch', limit: 2, skip: 4 }, 0)
    expect(last.commits.map((c) => c.subject)).toEqual(['feat: f1.txt', 'init'])
    expect(last.more).toBe(false)
  })
  it('are searched by git (message, author, hash start) with a cap, not read in full and filtered here', async () => {
    commit('apple.txt', '2030-01-01T00:00:00Z', 'Ada')
    commit('pear.txt', '2030-01-02T00:00:00Z', 'Bo')
    expect((await inPlaceHistory(repo, { scope: 'branch', search: 'APPLE' }, 0)).commits.map((c) => c.subject)).toEqual(['feat: apple.txt'])
    expect((await inPlaceHistory(repo, { scope: 'branch', search: 'bo' }, 0)).commits.map((c) => c.subject)).toEqual(['feat: pear.txt'])
    const hash = git(repo, 'rev-parse', 'HEAD')
    expect((await inPlaceHistory(repo, { scope: 'branch', search: hash.slice(0, 8) }, 0)).commits.map((c) => c.subject)).toEqual(['feat: pear.txt'])
    expect(await inPlaceHistory(repo, { scope: 'branch', search: 'nothing like this' }, 0)).toMatchObject({ commits: [], total: 0, more: false })
  })
  it('are none in a repository with no commits yet', async () => {
    const fresh = join(tmp, 'fresh')
    mkdirSync(fresh)
    git(fresh, 'init', '-q', '-b', 'main')
    expect(await inPlaceHistory(fresh, { scope: 'branch' }, 0)).toEqual({ commits: [], total: 0, more: false })
  })
})

describe('where an agent without a branch of its own works', () => {
  it('says whether the folder is a git repository and the branch it is on, empty when there is none', async () => {
    expect(await placeOf(repo)).toEqual({ git: true, branch: 'main' })
    expect(await placeOf(tmp)).toEqual({ git: false, branch: '' })
    const fresh = join(tmp, 'fresh2')
    mkdirSync(fresh)
    git(fresh, 'init', '-q', '-b', 'main')
    expect(await placeOf(fresh)).toEqual({ git: true, branch: '' })
  })
})

describe('a branch that shares no history with its base', () => {
  it('is said so, with no commit count and no conflict check, instead of counting every old commit and calling it clean', async () => {
    // main was rewritten: this branch holds the same files under different commits, so git finds no merge base.
    git(repo, 'checkout', '-q', '--orphan', 'old-history')
    git(repo, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'the old first commit')
    writeFileSync(join(repo, 'more.txt'), 'x')
    git(repo, 'add', '.')
    git(repo, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'the old second commit')
    expect(await finishReadiness(repo, repo, 'old-history', 'main')).toMatchObject({ unrelated: true, ahead: 0, conflicts: [] })
  })
  it('is not said of a branch that came from the base', async () => {
    writeFileSync(join(wt.path, 'w.txt'), 'w')
    git(wt.path, 'add', '.')
    git(wt.path, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'work')
    expect(await finishReadiness(repo, wt.path, wt.branch, 'main')).toMatchObject({ unrelated: false, ahead: 1 })
  })
})

describe('a long history is never read whole', () => {
  afterEach(() => useGit(null))
  const recording = () => {
    const seen = join(tmp, 'calls.log')
    const bin = join(tmp, 'recording-git')
    writeFileSync(bin, `#!/bin/sh\necho "$*" >> '${seen}'\nexec git "$@"\n`)
    chmodSync(bin, 0o755)
    useGit({ bin, source: 'bundled', env: {}, pathDirs: [] })
    return () => readFileSync(seen, 'utf8').trim().split('\n')
  }
  it('asks git for one page: a count and a skip, so a thousand commits are not read to show fifty', async () => {
    const calls = recording()
    await inPlaceHistory(repo, { scope: 'branch', limit: 2, skip: 1 }, 0)
    const log = calls().filter((l) => l.startsWith('log '))
    expect(log.length).toBeGreaterThan(0)
    // One more than the page, to know whether more follow; every log walks with a limit.
    expect(log.some((l) => l.includes('--max-count=3') && l.includes('--skip=1'))).toBe(true)
    expect(log.every((l) => l.includes('--max-count=') || l.includes('--no-walk'))).toBe(true)
  })
  it('searches by git with a fixed string, no case, and a cap on what it names; the page is then read for those commits only', async () => {
    const calls = recording()
    await inPlaceHistory(repo, { scope: 'branch', search: 'init' }, 0)
    const log = calls().filter((l) => l.startsWith('log '))
    const grep = log.find((l) => l.includes('--grep=init'))!
    expect(grep).toContain('-F')
    expect(grep).toContain('-i')
    expect(grep).toContain('--max-count=200')
    expect(log.find((l) => l.includes('--author=init'))).toContain('--max-count=200')
    expect(log.some((l) => l.includes('--no-walk=sorted'))).toBe(true)
    // No log of the whole range went by: nothing read in full and filtered here.
    expect(log.every((l) => l.includes('--max-count=') || l.includes('--no-walk'))).toBe(true)
  })
  it('stops a search that takes too long and says so, instead of leaving the panel waiting', async () => {
    const bin = join(tmp, 'slow-git')
    // Only the search is slow; everything else is git as it is.
    writeFileSync(bin, '#!/bin/sh\ncase "$*" in *--grep*) exec sleep 5;; esac\nexec git "$@"\n')
    chmodSync(bin, 0o755)
    useGit({ bin, source: 'bundled', env: {}, pathDirs: [] })
    const started = Date.now()
    await expect(inPlaceHistory(repo, { scope: 'branch', search: 'x', searchTimeoutMs: 200 } as never, 0)).rejects.toThrow(/too long/)
    expect(Date.now() - started).toBeLessThan(3000)
  })
})

describe('the page a window asks for', () => {
  it('is kept to 1 to 200 commits from a whole, non-negative place, whatever was sent', () => {
    expect(clampPage({})).toEqual({ limit: 50, skip: 0 })
    expect(clampPage({ limit: 0, skip: -5 })).toEqual({ limit: 1, skip: 0 })
    expect(clampPage({ limit: 100000, skip: 7.9 })).toEqual({ limit: 200, skip: 7 })
    expect(clampPage({ limit: Number.NaN, skip: Number.POSITIVE_INFINITY })).toEqual({ limit: 50, skip: 0 })
    expect(clampPage({ limit: '9' as never, skip: '2' as never })).toEqual({ limit: 50, skip: 0 })
  })
})

describe('landing a branch that shares no history with its base', () => {
  it('is refused by the merge itself, whichever button asked, with the same words as Land', async () => {
    git(repo, 'checkout', '-q', '--orphan', 'rewritten')
    writeFileSync(join(repo, 'x.txt'), 'x')
    git(repo, 'add', '.')
    git(repo, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'rewritten work')
    git(repo, 'checkout', '-q', 'main')
    await expect(mergeInto(repo, 'rewritten', 'main')).rejects.toThrow("rewritten does not come from main's history: reset it onto main before landing.")
  })
})
