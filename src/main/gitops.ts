import { execFile } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import { git } from './worktree'

export type ChangeStatus = 'added' | 'modified' | 'deleted'
export interface Change {
  path: string
  status: ChangeStatus
}

const STATUS: Record<string, ChangeStatus> = { A: 'added', D: 'deleted' }
const lines = (s: string) => s.split('\n').filter(Boolean)
const mergeBase = (cwd: string, base: string) => git(cwd, 'merge-base', 'HEAD', base)

/** Everything the agent changed since it branched off `base`: commits, uncommitted edits and new files. */
export async function changes(cwd: string, base: string): Promise<Change[]> {
  const from = await mergeBase(cwd, base)
  const tracked = lines(await git(cwd, 'diff', '--name-status', '--no-renames', from)).map((l) => {
    const [code, ...rest] = l.split('\t')
    return { path: rest.join('\t'), status: STATUS[code!] ?? 'modified' }
  })
  const untracked = lines(await git(cwd, 'ls-files', '--others', '--exclude-standard')).map((path) => ({ path, status: 'added' as const }))
  return [...tracked, ...untracked].sort((a, b) => a.path.localeCompare(b.path))
}

/** The file as it was at the branch point, for the left side of a diff; empty for files the agent created. */
export async function originalContent(cwd: string, base: string, path: string) {
  const from = await mergeBase(cwd, base)
  try {
    return (await promisify(execFile)('git', ['show', `${from}:${path}`], { cwd, maxBuffer: 64 * 1024 * 1024 })).stdout
  } catch {
    return ''
  }
}

export async function listFiles(cwd: string) {
  return lines(await git(cwd, 'ls-files', '--cached', '--others', '--exclude-standard')).sort((a, b) => a.localeCompare(b))
}

// The renderer names files relative to the worktree; nothing it sends may reach outside it.
function inside(cwd: string, path: string) {
  const full = resolve(cwd, path)
  const rel = relative(cwd, full)
  if (isAbsolute(path) || rel.startsWith('..') || isAbsolute(rel)) throw new Error(`${path} is outside the agent's worktree`)
  return full
}

export async function readWorktreeFile(cwd: string, path: string) {
  return readFile(inside(cwd, path), 'utf8')
}

export async function writeWorktreeFile(cwd: string, path: string, content: string) {
  const full = inside(cwd, path)
  await mkdir(dirname(full), { recursive: true })
  await writeFile(full, content)
}

export async function commitAll(cwd: string, message: string) {
  if (!message.trim()) throw new Error('A commit message is required.')
  await git(cwd, 'add', '-A')
  if (!(await git(cwd, 'status', '--porcelain'))) throw new Error('Nothing to commit.')
  await git(cwd, 'commit', '-m', message.trim())
}

/** Throw away uncommitted changes to one file: back to the last commit, or gone if the agent created it. */
export async function discardFile(cwd: string, path: string) {
  const full = inside(cwd, path)
  try {
    await git(cwd, 'cat-file', '-e', `HEAD:${path}`)
    await git(cwd, 'checkout', 'HEAD', '--', path)
  } catch {
    await rm(full, { force: true })
  }
}

/**
 * Merge the agent's branch into `base` in the user's own checkout. Refuses when that checkout is on another
 * branch or has uncommitted work, and backs out completely on conflict, so the user's tree is never left half-merged.
 */
export async function mergeInto(repo: string, branch: string, base: string) {
  const current = await git(repo, 'rev-parse', '--abbrev-ref', 'HEAD')
  if (current !== base) throw new Error(`${base} is not checked out in ${repo} (it is on ${current}); switch to ${base} first.`)
  if (await git(repo, 'status', '--porcelain')) throw new Error(`${repo} has uncommitted changes; commit or stash them before merging.`)
  try {
    await git(repo, 'merge', '--no-ff', '--no-edit', branch)
  } catch {
    const conflicted = lines(await git(repo, 'diff', '--name-only', '--diff-filter=U')).join(', ')
    await git(repo, 'merge', '--abort')
    throw new Error(`Merge conflict in ${conflicted || 'some files'}; the merge was aborted and ${base} is unchanged.`)
  }
}

export async function pushBranch(cwd: string, branch: string) {
  await git(cwd, 'push', '-u', 'origin', branch)
}

/** Open a pull request with the GitHub CLI; returns its URL. */
export async function createPr(cwd: string, branch: string, base: string) {
  const { stdout } = await promisify(execFile)('gh', ['pr', 'create', '--head', branch, '--base', base, '--fill'], { cwd })
  return lines(stdout).at(-1) ?? ''
}
