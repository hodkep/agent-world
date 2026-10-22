import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, realpathSync, rmSync } from 'node:fs'
import { basename, join } from 'node:path'
import { promisify } from 'node:util'
import type { Leftover } from '../shared/types'
import { gitBin, gitProcessEnv } from './gitProgram'

const run = promisify(execFile)
export const git = async (cwd: string, ...args: string[]) => (await run(gitBin(), args, { cwd, env: gitProcessEnv(), maxBuffer: 64 * 1024 * 1024 })).stdout.trim()

/** A repository with nothing committed yet: it has no branch to start another from, and an agent there works in the folder itself. */
export class NoCommitsError extends Error {
  constructor() {
    super('This repository has no commits yet, so there is nothing to start a branch from.')
  }
}

/** Whether `dir` is a repository that has at least one commit (HEAD is a commit, not yet unborn). */
export async function hasCommits(dir: string): Promise<boolean> {
  try {
    await git(dir, 'rev-parse', '--verify', '-q', 'HEAD')
    return true
  } catch {
    return false
  }
}

/** The branch checked out in `repo` ('HEAD' for a detached one), or an empty name when there is none to speak of: no commits yet, or not a repository. */
export async function checkedOutBranch(repo: string): Promise<string> {
  try {
    return await git(repo, 'rev-parse', '--abbrev-ref', 'HEAD')
  } catch {
    return ''
  }
}

/** What git failed with as a sentence for a person: the command that was run is left out, and so is the advice that follows git's message. */
export function plainGitError(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err)
  const fatal = /^fatal: (.+)$/m.exec(text)?.[1]
  return fatal ? `git said: ${fatal}` : text.replace(/^Command failed: [^\n]*\n?/, '').split('\n')[0]!.trim() || text
}

export class DirtyWorktreeError extends Error {
  constructor(readonly path: string, readonly status: string) {
    super(`Worktree ${path} has uncommitted changes`)
  }
}

export async function isGitRepo(dir: string): Promise<boolean> {
  try {
    return (await git(dir, 'rev-parse', '--is-inside-work-tree')) === 'true'
  } catch {
    return false
  }
}

// Hash suffix keeps two repos that share a folder name from colliding under rootDir.
export const slug = (repoPath: string) => `${basename(repoPath)}-${createHash('sha1').update(repoPath).digest('hex').slice(0, 8)}`

/** `from` starts the branch at another branch (a clone) instead of HEAD; the base stays the repo's current branch unless `base` names another to start from and land on. */
export async function createWorktree(o: { repoPath: string; name: string; rootDir: string; from?: string; base?: string }) {
  if (!(await hasCommits(o.repoPath))) throw new NoCommitsError()
  const branch = `aw/${o.name}`
  const path = join(o.rootDir, slug(o.repoPath), o.name)
  // The branch the agent starts from is what its diff is measured against and where it merges back.
  const base = o.base ?? (await git(o.repoPath, 'rev-parse', '--abbrev-ref', 'HEAD'))
  const start = o.from ?? o.base
  await git(o.repoPath, 'worktree', 'add', '-b', branch, path, ...(start ? [start] : []))
  return { path, branch, base }
}

/** Does a hire here get a branch and worktree of its own? Only then can an old aw/<name> be in its way. */
export async function makesBranch(o: { repoPath: string; inPlace?: boolean }) {
  return !o.inPlace && (await isGitRepo(o.repoPath)) && (await hasCommits(o.repoPath))
}

/**
 * The worktree an agent is hired into, or null when it works in the folder itself: the person asked for that, the folder is not a repository, or it is a
 * repository with nothing committed (no branch to start from). When git cannot make one the reason comes back as a sentence, not as the command that failed.
 */
export async function worktreeFor(o: { repoPath: string; name: string; rootDir: string; from?: string; base?: string; inPlace?: boolean }) {
  if (!(await makesBranch(o))) return null
  try {
    return await createWorktree(o)
  } catch (err) {
    throw new Error(plainGitError(err))
  }
}

/** Is `aw/<name>` already a branch in this repo, or its worktree folder already there? (An earlier agent may have left either.) */
export async function nameTaken(o: { repoPath: string; name: string; rootDir: string }): Promise<boolean> {
  if (!(await isGitRepo(o.repoPath))) return false
  if (existsSync(join(o.rootDir, slug(o.repoPath), o.name))) return true
  try {
    await git(o.repoPath, 'rev-parse', '--verify', '--quiet', `refs/heads/aw/${o.name}`)
    return true
  } catch {
    return false
  }
}

export async function removeWorktree(o: { repoPath: string; path: string; force?: boolean }) {
  if (!o.force) {
    const status = await git(o.path, 'status', '--porcelain')
    if (status) throw new DirtyWorktreeError(o.path, status)
  }
  await git(o.repoPath, 'worktree', 'remove', ...(o.force ? ['--force'] : []), o.path)
}

const listed = async (repoPath: string) => (await git(repoPath, 'worktree', 'list', '--porcelain')).split('\n').filter((l) => l.startsWith('worktree ')).map((l) => l.slice(9))
const same = (a: string, b: string) => a === b || (existsSync(a) && existsSync(b) && realpathSync(a) === realpathSync(b))

export async function leftoverOf(o: { repoPath: string; name: string; rootDir: string }): Promise<Leftover | null> {
  if (!(await nameTaken(o))) return null
  const branch = `aw/${o.name}`
  const path = join(o.rootDir, slug(o.repoPath), o.name)
  const hasFolder = existsSync(path)
  const hasBranch = await git(o.repoPath, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`).then(() => true, () => false)
  const registered = hasFolder && (await listed(o.repoPath)).some((p) => same(p, path))
  const unmerged = hasBranch ? Number(await git(o.repoPath, 'rev-list', '--count', `HEAD..${branch}`).catch(() => '0')) : 0
  const dirty = !hasFolder ? 0 : registered ? (await git(path, 'status', '--porcelain')).split('\n').filter(Boolean).length : readdirSync(path).length
  return { branch, path, hasBranch, hasFolder, registered, unmerged, dirty }
}

/** Deletes what is left under the name, whatever work is in it: the worktree, any folder git does not know, and the branch. */
export async function removeLeftover(o: { repoPath: string; name: string; rootDir: string }) {
  const found = await leftoverOf(o)
  if (!found) return
  if (found.registered) await git(o.repoPath, 'worktree', 'remove', '--force', found.path)
  // Only ever the folder this app makes for the name, under its own worktrees folder.
  if (existsSync(found.path)) rmSync(found.path, { recursive: true, force: true })
  await git(o.repoPath, 'worktree', 'prune')
  if (found.hasBranch) await git(o.repoPath, 'branch', '-D', found.branch)
}

/** A worktree on the branch an earlier agent left, so a new agent of the same name carries on from its work. */
export async function attachLeftover(o: { repoPath: string; name: string; rootDir: string }) {
  const found = await leftoverOf(o)
  if (!found?.hasBranch) throw new Error(`There is no branch aw/${o.name} to carry on from.`)
  if (found.hasFolder && !found.registered) throw new Error(`The folder for aw/${o.name} is not one git knows, so it cannot be used. Remove it first.`)
  const base = await checkedOutBranch(o.repoPath)
  if (!found.hasFolder) {
    await git(o.repoPath, 'worktree', 'prune')
    await git(o.repoPath, 'worktree', 'add', found.path, found.branch)
  }
  return { path: found.path, branch: found.branch, base }
}
