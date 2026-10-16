import { execFile } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import { isOkfPath } from './okf'
import { checkedOutBranch, git, hasCommits, isGitRepo } from './worktree'
import { gitBin, gitProcessEnv } from './gitProgram'

/** The commits made in a checkout after a time (newest first, at most 20) and the files they touched: what an agent did while it worked on something. Empty when this is not a repository. */
export async function commitsSince(cwd: string, sinceMs: number): Promise<{ commits: { sha: string; subject: string }[]; files: string[] }> {
  try {
    const out = await git(cwd, 'log', `--since=${new Date(sinceMs).toISOString()}`, '-n', '20', '--name-only', '--format=%x1e%h%x1f%s')
    const commits: { sha: string; subject: string }[] = []
    const files = new Set<string>()
    for (const block of out.split('\x1e').filter((b) => b.trim())) {
      const [head, ...rest] = block.split('\n')
      const [sha, subject] = (head ?? '').split('\x1f')
      if (!sha) continue
      commits.push({ sha, subject: subject ?? '' })
      for (const f of rest) if (f.trim()) files.add(f.trim())
    }
    return { commits, files: [...files] }
  } catch {
    return { commits: [], files: [] }
  }
}

/** The files with changes not yet committed (edited, added or new), so work an agent has not committed still counts as work. */
export async function uncommittedFiles(cwd: string): Promise<string[]> {
  try {
    const out = await git(cwd, 'status', '--porcelain', '-uall')
    return out.split('\n').map((l) => l.replace(/^\s*\S+\s+/, '').replace(/^.* -> /, '').trim()).filter(Boolean)
  } catch {
    return []
  }
}

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
  return [...tracked, ...untracked].filter((c) => !isOkfPath(c.path)).sort((a, b) => a.path.localeCompare(b.path))
}

/** The file as it was at the branch point, for the left side of a diff; empty for files the agent created. */
export async function originalContent(cwd: string, base: string, path: string) {
  const from = await mergeBase(cwd, base)
  try {
    return (await promisify(execFile)(gitBin(), ['show', `${from}:${path}`], { cwd, env: gitProcessEnv(), maxBuffer: 64 * 1024 * 1024 })).stdout
  } catch {
    return ''
  }
}

export async function listFiles(cwd: string) {
  return lines(await git(cwd, 'ls-files', '--cached', '--others', '--exclude-standard'))
    .filter((f) => !isOkfPath(f))
    .sort((a, b) => a.localeCompare(b))
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

/** The plan the plan gate asks an agent to write: it is read by the office, and is not the agent's work. */
const NOT_WORK = [':(exclude).agent-world/plan.md']

export async function commitAll(cwd: string, message: string) {
  if (!message.trim()) throw new Error('A commit message is required.')
  await git(cwd, 'add', '-A', '--', '.', ...NOT_WORK)
  if (!(await git(cwd, 'status', '--porcelain', '--', '.', ...NOT_WORK))) throw new Error('Nothing to commit.')
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

// ---- What is uncommitted, staging, and the history of the branch -----------------------------------------------

const run = promisify(execFile)
/** Git's output exactly as it came (the other helper trims it, which would eat the leading space of a ` M` status line). */
const raw = async (cwd: string, ...args: string[]) => (await run('git', args, { cwd, maxBuffer: 64 * 1024 * 1024 })).stdout

export interface WorktreeStatus {
  staged: Change[]
  changed: Change[]
  untracked: Change[]
}

/** The worktree's uncommitted files in three groups: ready to commit, edited since (a file can be in both), and new. */
export async function worktreeStatus(cwd: string): Promise<WorktreeStatus> {
  const out: WorktreeStatus = { staged: [], changed: [], untracked: [] }
  for (const entry of (await raw(cwd, 'status', '--porcelain=v1', '-z', '--no-renames', '--untracked-files=all')).split('\0').filter(Boolean)) {
    const x = entry[0]!
    const y = entry[1]!
    const path = entry.slice(3)
    if (isOkfPath(path)) continue
    if (x === '?' && y === '?') out.untracked.push({ path, status: 'added' })
    else {
      if ('MADRCT'.includes(x)) out.staged.push({ path, status: STATUS[x] ?? 'modified' })
      if ('MDAT'.includes(y)) out.changed.push({ path, status: STATUS[y] === 'added' ? 'modified' : (STATUS[y] ?? 'modified') })
    }
  }
  for (const list of [out.staged, out.changed, out.untracked]) list.sort((a, b) => a.path.localeCompare(b.path))
  return out
}

/** Stages these files (new and deleted ones too), ready to commit. */
export async function stage(cwd: string, paths: string[]) {
  for (const p of paths) inside(cwd, p)
  if (paths.length) await git(cwd, 'add', '-A', '--', ...paths)
}

/** Takes these files out of what will be committed; their edits stay in the worktree. */
export async function unstage(cwd: string, paths: string[]) {
  for (const p of paths) inside(cwd, p)
  if (paths.length) await git(cwd, 'reset', '-q', 'HEAD', '--', ...paths)
}

/** Commits what is staged and nothing else. */
export async function commitStaged(cwd: string, message: string) {
  if (!message.trim()) throw new Error('A commit message is required.')
  if (!(await git(cwd, 'diff', '--cached', '--name-only'))) throw new Error('Nothing is staged. Stage some files first, or use Commit all.')
  await git(cwd, 'commit', '-m', message.trim())
}

/** An uncommitted file: as the last commit has it on the left, as it is in the worktree on the right; empty when it is new or deleted. */
export async function dirtyDiff(cwd: string, path: string) {
  inside(cwd, path)
  const original = await run('git', ['show', `HEAD:${path}`], { cwd, maxBuffer: 64 * 1024 * 1024 }).then((r) => r.stdout, () => '')
  const current = await readWorktreeFile(cwd, path).catch(() => '')
  return { original, current }
}

export interface CommitInfo {
  hash: string
  short: string
  subject: string
  author: string
  /** When it was committed, in milliseconds. */
  at: number
  files: number
  added: number
  deleted: number
  /** The commit the worktree is on. */
  head: boolean
  /** Not on the branch's upstream yet; only said for a branch that has one. */
  local: boolean
}
export interface CommitPage {
  commits: CommitInfo[]
  /** How many commits there are in this scope (before a search). */
  total: number
  more: boolean
}

const HEX = /^[0-9a-f]{7,40}$/i
const commitOnly = (hash: string) => {
  if (!HEX.test(hash)) throw new Error('That is not a commit.')
  return hash
}

/** The branch's commits, newest first: those since it left `base` (scope "branch") or all that lead to it ("all"). A search matches message, author or hash. */
export async function history(cwd: string, base: string, o: { scope: 'branch' | 'all'; search?: string; limit?: number; skip?: number }): Promise<CommitPage> {
  const range = o.scope === 'branch' ? `${await mergeBase(cwd, base)}..HEAD` : 'HEAD'
  const searching = !!o.search?.trim()
  const limit = o.limit ?? 50
  const skip = o.skip ?? 0
  // A search reads the whole range and filters it here; a plain page asks git for just its part.
  const window = searching ? [] : [`--max-count=${limit + 1}`, `--skip=${skip}`]
  const text = await raw(cwd, 'log', '--no-renames', '--shortstat', '--format=%x1e%H%x1f%an%x1f%ct%x1f%s', ...window, range)
  const pushed = await git(cwd, 'rev-parse', '--abbrev-ref', '@{u}').then(
    async () => new Set((await git(cwd, 'rev-list', '@{u}..HEAD')).split('\n').filter(Boolean)),
    () => null
  )
  const head = await git(cwd, 'rev-parse', 'HEAD')
  let commits: CommitInfo[] = text
    .split('\x1e')
    .filter(Boolean)
    .map((rec) => {
      const [h, author, ct, rest] = [...rec.split('\x1f').slice(0, 3), rec.split('\x1f').slice(3).join('\x1f')]
      const [subject, ...tail] = rest!.split('\n')
      const stat = tail.join('\n')
      const num = (re: RegExp) => Number(re.exec(stat)?.[1] ?? 0)
      return {
        hash: h!,
        short: h!.slice(0, 7),
        subject: subject!,
        author: author!,
        at: Number(ct) * 1000,
        files: num(/(\d+) files? changed/),
        added: num(/(\d+) insertions?\(\+\)/),
        deleted: num(/(\d+) deletions?\(-\)/),
        head: h === head,
        local: pushed ? pushed.has(h!) : false
      }
    })
  const total = searching ? commits.length : Number((await git(cwd, 'rev-list', '--count', range)) || 0)
  if (searching) {
    const q = o.search!.trim().toLowerCase()
    commits = commits.filter((c) => c.subject.toLowerCase().includes(q) || c.author.toLowerCase().includes(q) || c.hash.startsWith(q))
    return { commits: commits.slice(skip, skip + limit), total: commits.length, more: commits.length > skip + limit }
  }
  return { commits: commits.slice(0, limit), total, more: commits.length > limit }
}

/** One commit: its message in full and the files it changed. */
export async function commitDetail(cwd: string, hash: string): Promise<{ subject: string; body: string; author: string; at: number; files: Change[] }> {
  commitOnly(hash)
  const [head, ...rest] = (await raw(cwd, 'show', '-s', '--format=%an%x1f%ct%x1f%s%x1f%b', hash)).split('\x1f')
  const body = rest.slice(2).join('\x1f').trim()
  const files = lines(await raw(cwd, 'show', '--name-status', '--no-renames', '--format=', hash)).map((l) => {
    const [code, ...p] = l.split('\t')
    return { path: p.join('\t'), status: STATUS[code!] ?? ('modified' as const) }
  })
  return { author: head!, at: Number(rest[0]) * 1000, subject: rest[1]!, body, files: files.filter((f) => !isOkfPath(f.path)).sort((a, b) => a.path.localeCompare(b.path)) }
}

/** One file of a commit: before it on the left, after it on the right; empty on the side where the file did not exist. */
export async function commitDiff(cwd: string, hash: string, path: string) {
  commitOnly(hash)
  inside(cwd, path)
  const at = (rev: string) => run('git', ['show', `${rev}:${path}`], { cwd, maxBuffer: 64 * 1024 * 1024 }).then((r) => r.stdout, () => '')
  return { original: await at(`${hash}^`), current: await at(hash) }
}

/**
 * Merge the agent's branch into `base` in the user's own checkout. Refuses when that checkout is on another
 * branch or has uncommitted work, and backs out completely on conflict, so the user's tree is never left half-merged.
 */
export async function mergeInto(repo: string, branch: string, base: string, o: { squash?: boolean; message?: string } = {}) {
  const current = await checkedOutBranch(repo)
  if (current !== base) throw new Error(`${base} is not checked out in ${repo} (it is on ${current}); switch to ${base} first.`)
  if (await git(repo, 'status', '--porcelain', '--', '.', ...NOT_WORK)) throw new Error(`${repo} has uncommitted changes; commit or stash them before merging.`)
  try {
    if (o.squash) {
      await git(repo, 'merge', '--squash', branch)
      await git(repo, 'commit', '-m', o.message?.trim() || `Merge ${branch}`)
    } else await git(repo, 'merge', '--no-ff', '--no-edit', branch)
  } catch {
    const conflicted = lines(await git(repo, 'diff', '--name-only', '--diff-filter=U')).join(', ')
    // A squash leaves no MERGE_HEAD to abort; --merge puts the tree back to how it was.
    await git(repo, 'merge', '--abort').catch(() => git(repo, 'reset', '--merge'))
    throw new Error(`Merge conflict in ${conflicted || 'some files'}; the merge was aborted and ${base} is unchanged.`)
  }
}

export interface Readiness {
  /** Commits on the agent's branch that are not on the base branch. */
  ahead: number
  /** Files with uncommitted changes in the agent's worktree. */
  uncommitted: number
  /** The main checkout is on the base branch with nothing uncommitted, so a merge can go ahead. */
  baseReady: boolean
  /** Files that would conflict if merged now. */
  conflicts: string[]
}

/** What stands between the agent's work and the base branch, without changing anything. */
export async function finishReadiness(repo: string, cwd: string, branch: string, base: string): Promise<Readiness> {
  const ahead = Number(await git(cwd, 'rev-list', '--count', `${base}..${branch}`))
  const uncommitted = lines(await git(cwd, 'status', '--porcelain', '--', '.', ...NOT_WORK)).length
  const baseReady = (await checkedOutBranch(repo)) === base && !(await git(repo, 'status', '--porcelain', '--', '.', ...NOT_WORK))
  let conflicts: string[] = []
  if (ahead > 0) {
    try {
      await git(repo, 'merge-tree', '--write-tree', base, branch)
    } catch (e) {
      // merge-tree exits 1 with the conflicted paths listed after the tree id.
      const out = String((e as { stdout?: string }).stdout ?? '')
      conflicts = [...new Set([...out.matchAll(/^\d+ [0-9a-f]+ [123]\t(.+)$/gm)].map((m) => m[1]!))]
    }
  }
  return { ahead, uncommitted, baseReady, conflicts }
}

/** What the branch has added to `base` since it left it, as a patch: committed work only, and not the plan files agents keep in `.agent-world/`. */
export const branchDiff = (cwd: string, base: string, branch: string) => git(cwd, 'diff', '--no-color', '--no-ext-diff', `${base}...${branch}`, '--', '.', ':(exclude).agent-world')

export async function pushBranch(cwd: string, branch: string) {
  await git(cwd, 'push', '-u', 'origin', branch)
}

/** Open a pull request with the GitHub CLI; returns its URL. */
export async function createPr(cwd: string, branch: string, base: string) {
  const { stdout } = await promisify(execFile)('gh', ['pr', 'create', '--head', branch, '--base', base, '--fill'], { cwd })
  return lines(stdout).at(-1) ?? ''
}

export interface Branch {
  name: string
  kind: 'local' | 'remote'
  /** The one the repo's own checkout is on. */
  checkedOut: boolean
}

/** The repo's branches to pick a base from: local first, then remote. Agents' own branches (`aw/…`) are never offered. */
export async function branches(repo: string): Promise<Branch[]> {
  const current = await checkedOutBranch(repo)
  const of = async (ref: string, kind: Branch['kind']) =>
    lines(await git(repo, 'for-each-ref', '--format=%(refname:short)', ref))
      .filter((n) => !n.startsWith('aw/') && !/^[^/]+\/(HEAD|aw\/)/.test(n) && n !== 'origin')
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ name, kind, checkedOut: kind === 'local' && name === current }))
  return [...(await of('refs/heads', 'local')), ...(await of('refs/remotes', 'remote'))]
}

/** What the hire form needs to know about a folder: its branch and branches, and `unborn` when it is a repository with no commits yet (nothing to branch from). */
export async function repoInfo(folder: string): Promise<{ current: string; branches: Branch[]; unborn?: true }> {
  if (!(await isGitRepo(folder))) return { current: '', branches: [] }
  if (!(await hasCommits(folder))) return { current: '', branches: [], unborn: true }
  return { current: await checkedOutBranch(folder), branches: await branches(folder) }
}

/** A base must be something git can resolve to a commit. */
export async function assertBranch(repo: string, name: string): Promise<void> {
  try {
    await git(repo, 'rev-parse', '--verify', '--quiet', `${name}^{commit}`)
  } catch {
    throw new Error(`There is no branch called ${name}.`)
  }
}

/**
 * When the stored base leaves many more files changed than the branch the checkout is on would, that is likely a base left over from when
 * the agent was hired: the branch to suggest, and how many files differ from it. Null when the base is that branch or the gap is small.
 */
export async function staleHint(repo: string, cwd: string, base: string, files: number): Promise<{ branch: string; files: number } | null> {
  try {
    const current = await checkedOutBranch(repo)
    if (!current || current === base || current === 'HEAD') return null
    const n = (await changes(cwd, current)).length
    return files - n >= 5 && n * 2 <= files ? { branch: current, files: n } : null
  } catch {
    return null
  }
}
