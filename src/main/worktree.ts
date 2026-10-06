import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
export const git = async (cwd: string, ...args: string[]) => (await run('git', args, { cwd, maxBuffer: 64 * 1024 * 1024 })).stdout.trim()

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
  const branch = `aw/${o.name}`
  const path = join(o.rootDir, slug(o.repoPath), o.name)
  // The branch the agent starts from is what its diff is measured against and where it merges back.
  const base = o.base ?? (await git(o.repoPath, 'rev-parse', '--abbrev-ref', 'HEAD'))
  const start = o.from ?? o.base
  await git(o.repoPath, 'worktree', 'add', '-b', branch, path, ...(start ? [start] : []))
  return { path, branch, base }
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
