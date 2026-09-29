import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { basename, join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const git = async (cwd: string, ...args: string[]) => (await run('git', args, { cwd })).stdout.trim()

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
const slug = (repoPath: string) => `${basename(repoPath)}-${createHash('sha1').update(repoPath).digest('hex').slice(0, 8)}`

export async function createWorktree(o: { repoPath: string; name: string; rootDir: string }) {
  const branch = `aw/${o.name}`
  const path = join(o.rootDir, slug(o.repoPath), o.name)
  await git(o.repoPath, 'worktree', 'add', '-b', branch, path)
  return { path, branch }
}

export async function removeWorktree(o: { repoPath: string; path: string; force?: boolean }) {
  if (!o.force) {
    const status = await git(o.path, 'status', '--porcelain')
    if (status) throw new DirtyWorktreeError(o.path, status)
  }
  await git(o.repoPath, 'worktree', 'remove', ...(o.force ? ['--force'] : []), o.path)
}
