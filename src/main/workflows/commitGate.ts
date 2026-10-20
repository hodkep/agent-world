import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { gitBin, gitProcessEnv } from '../gitProgram'

/**
 * Where a commit is held back for every program alike. Git is started with the office's folder of hooks (set through its own environment
 * variables, so no file of the repository or of the person's git configuration is touched); its pre-commit hook asks the office whether
 * the agent's plan allows a commit, and each hook, this one included, then runs the repository's own hook of the same name.
 */
export const HOOK_NAMES = [
  'applypatch-msg', 'pre-applypatch', 'post-applypatch', 'pre-commit', 'pre-merge-commit', 'prepare-commit-msg', 'commit-msg', 'post-commit', 'pre-rebase',
  'post-checkout', 'post-merge', 'pre-push', 'pre-auto-gc', 'post-rewrite', 'reference-transaction', 'push-to-checkout', 'post-index-change', 'sendemail-validate', 'fsmonitor-watchman', 'proc-receive'
]

// The office's address and the agent's token are in the environment it started the agent with. Anything that goes wrong lets the commit through:
// a held commit is the office's call, never a broken hook's.
const chain = (name: string) => `[ -n "$AW_ORIG_HOOKS" ] && [ "$AW_ORIG_HOOKS" != "$(dirname "$0")" ] && [ -x "$AW_ORIG_HOOKS/${name}" ] && exec "$AW_ORIG_HOOKS/${name}" "$@"
exit 0
`
const ASK = `if [ -n "$AW_MCP_URL" ] && [ -n "$AW_AGENT_TOKEN" ]; then
  case "$AW_MCP_URL" in
    http://127.0.0.1:*|http://localhost:*|http://\\[::1\\]:*)
      tok=$(printf '%s' "$AW_AGENT_TOKEN" | tr -cd 'A-Za-z0-9._~+/=-')
      here=$(pwd | sed 's/\\\\/\\\\\\\\/g; s/"/\\\\"/g')
      out=$(printf 'header = "Authorization: Bearer %s"\\n' "$tok" | curl -s --max-time 5 -X POST -K - -H "Content-Type: application/json" --data "{\\"cwd\\":\\"$here\\"}" "\${AW_MCP_URL%/mcp}/hook/git-commit" 2>/dev/null)
      reason=$(printf '%s' "$out" | sed -n 's/.*"block":"\\([^"]*\\)".*/\\1/p')
      if [ -n "$reason" ]; then
        printf 'Agent World: this commit is held. %s\\n' "$reason" >&2
        exit 1
      fi ;;
  esac
fi
`
// git runs this before it moves any reference, and `--no-verify` does not skip it: a commit cannot reach the agent's own branch while the office holds it.
// Only the first step ("prepared") of an update to a branch asks, and its last ("committed") tells the office it happened; the repository's own hook of this name then gets what git sent.
const REF_SCRIPT = `#!/bin/sh
# Part of Agent World. Safe to delete: git then runs the repository's own hooks again.
state="$1"
input=$(cat)
if { [ "$state" = prepared ] || [ "$state" = committed ]; } && [ -n "$AW_MCP_URL" ] && [ -n "$AW_AGENT_TOKEN" ]; then
  refs=$(printf '%s\\n' "$input" | awk 'substr($3,1,11)=="refs/heads/" { print $3 }' | tr -d '"\\134' | sed 's/.*/"&"/' | paste -sd, -)
  if [ -n "$refs" ]; then
    case "$AW_MCP_URL" in
      http://127.0.0.1:*|http://localhost:*|http://\\[::1\\]:*)
        tok=$(printf '%s' "$AW_AGENT_TOKEN" | tr -cd 'A-Za-z0-9._~+/=-')
        here=$(pwd | sed 's/\\\\/\\\\\\\\/g; s/"/\\\\"/g')
        if [ "$state" = committed ]; then event=git-landed; else event=git-ref; fi
        out=$(printf 'header = "Authorization: Bearer %s"\\n' "$tok" | curl -s --max-time 5 -X POST -K - -H "Content-Type: application/json" --data "{\\"cwd\\":\\"$here\\",\\"refs\\":[$refs]}" "\${AW_MCP_URL%/mcp}/hook/$event" 2>/dev/null)
        reason=$(printf '%s' "$out" | sed -n 's/.*"block":"\\([^"]*\\)".*/\\1/p')
        if [ "$state" = prepared ] && [ -n "$reason" ]; then
          printf 'Agent World: this change to a branch is held. %s\\n' "$reason" >&2
          exit 1
        fi ;;
    esac
  fi
fi
if [ -n "$AW_ORIG_HOOKS" ] && [ "$AW_ORIG_HOOKS" != "$(dirname "$0")" ] && [ -x "$AW_ORIG_HOOKS/reference-transaction" ]; then
  printf '%s\\n' "$input" | "$AW_ORIG_HOOKS/reference-transaction" "$@"
  exit $?
fi
exit 0
`

// git runs this before it sends anything, with one line on stdin for each reference: "<local ref> <local sha> <remote ref> <remote sha>". The office is asked about
// the local branches sent (a deleted branch or a tag has none), and `--no-verify` skips this hook, so a push that does is not held. The repository's own pre-push hook then gets what git sent.
const PUSH_SCRIPT = `#!/bin/sh
# Part of Agent World. Safe to delete: git then runs the repository's own hooks again.
input=$(cat)
if [ -n "$AW_MCP_URL" ] && [ -n "$AW_AGENT_TOKEN" ]; then
  refs=$(printf '%s\\n' "$input" | awk 'substr($1,1,11)=="refs/heads/" { print $1 }' | tr -d '"\\134' | sed 's/.*/"&"/' | paste -sd, -)
  if [ -n "$refs" ]; then
    case "$AW_MCP_URL" in
      http://127.0.0.1:*|http://localhost:*|http://\\[::1\\]:*)
        tok=$(printf '%s' "$AW_AGENT_TOKEN" | tr -cd 'A-Za-z0-9._~+/=-')
        here=$(pwd | sed 's/\\\\/\\\\\\\\/g; s/"/\\\\"/g')
        out=$(printf 'header = "Authorization: Bearer %s"\\n' "$tok" | curl -s --max-time 5 -X POST -K - -H "Content-Type: application/json" --data "{\\"cwd\\":\\"$here\\",\\"refs\\":[$refs]}" "\${AW_MCP_URL%/mcp}/hook/git-push" 2>/dev/null)
        reason=$(printf '%s' "$out" | sed -n 's/.*"block":"\\([^"]*\\)".*/\\1/p')
        if [ -n "$reason" ]; then
          printf 'Agent World: this push is held. %s\\n' "$reason" >&2
          exit 1
        fi ;;
    esac
  fi
fi
if [ -n "$AW_ORIG_HOOKS" ] && [ "$AW_ORIG_HOOKS" != "$(dirname "$0")" ] && [ -x "$AW_ORIG_HOOKS/pre-push" ]; then
  printf '%s\\n' "$input" | "$AW_ORIG_HOOKS/pre-push" "$@"
  exit $?
fi
exit 0
`

const script = (name: string) => name === 'reference-transaction' ? REF_SCRIPT : name === 'pre-push' ? PUSH_SCRIPT : `#!/bin/sh\n# Part of Agent World. Safe to delete: git then runs the repository's own hooks again.\n${name === 'pre-commit' ? ASK : ''}${chain(name)}`

/** Writes a hook for every kind git has into `dir`, each running the repository's own of that name. */
export function writeGitHooks(dir: string): void {
  mkdirSync(dir, { recursive: true })
  for (const name of HOOK_NAMES) {
    writeFileSync(join(dir, name), script(name))
    chmodSync(join(dir, name), 0o755)
  }
}

/** The variables that make git use `hooksDir` for an agent, on top of any configuration the environment already carries; `orig` is where the repository's own hooks are. */
export function gitEnv(env: NodeJS.ProcessEnv, hooksDir: string, orig: string): Record<string, string> {
  const n = Number.parseInt(env.GIT_CONFIG_COUNT ?? '0', 10)
  const at = Number.isInteger(n) && n > 0 ? n : 0
  return { GIT_CONFIG_COUNT: String(at + 1), [`GIT_CONFIG_KEY_${at}`]: 'core.hooksPath', [`GIT_CONFIG_VALUE_${at}`]: hooksDir, AW_ORIG_HOOKS: orig }
}

const git = (cwd: string, ...args: string[]): string => {
  try {
    return execFileSync(gitBin(), args, { cwd, env: gitProcessEnv(), timeout: 5000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

/** Where the repository's own hooks are: the folder core.hooksPath names (relative to the work tree), else the hooks folder of the repository; nothing outside a repository. */
export function originalHooks(cwd: string): string {
  const top = git(cwd, 'rev-parse', '--show-toplevel')
  if (!top) return ''
  const configured = git(cwd, 'config', '--get', 'core.hooksPath')
  if (configured) {
    const p = configured.startsWith('~/') ? join(homedir(), configured.slice(2)) : configured
    return isAbsolute(p) ? p : resolve(top, p)
  }
  const hooks = git(cwd, 'rev-parse', '--git-path', 'hooks')
  return hooks ? resolve(cwd, hooks) : ''
}

/** The branch checked out in `cwd`, for an agent that works in the folder itself and has none of its own; null for a detached head or outside a repository. */
export function currentBranch(cwd: string): string | null {
  const b = git(cwd, 'symbolic-ref', '--short', '-q', 'HEAD')
  return b || null
}

/** The files a commit would hold (paths from the work tree's root), as git sees them staged in `cwd`. */
export const stagedFiles = (cwd: string): string[] => git(cwd, 'diff', '--cached', '--name-only').split('\n').filter(Boolean)

/** A reason the person's hold gives, made safe to travel inside a JSON string the hook reads back with sed. */
export const blockText = (s: string): string => s.replace(/"/g, "'").replace(/\\/g, '/').replace(/\s+/g, ' ').trim()

/** Whether `path` is the folder `base` or under it (by real path, so a link cannot make another folder look like it). */
export function isInside(base: string, path: string): boolean {
  try {
    const r = relative(realpathSync(base), realpathSync(path))
    return r === '' || (!r.startsWith('..') && !isAbsolute(r))
  } catch {
    return false
  }
}

/** Whether an update of these references moves the agent's own branch (an agent working in the folder itself has none). */
export const holdsBranch = (branch: string | null, refs: string[]): boolean => !!branch && refs.includes(`refs/heads/${branch}`)

/** Whether an update of these references moves the base branch the agent's work lands on (an agent with no base of its own lands nothing). */
export const movesBase = (base: string | null, refs: string[]): boolean => !!base && refs.includes(`refs/heads/${base}`)

/** The commit a branch points at, or null when there is no such branch (or `cwd` is not a repository). */
export const branchHead = (cwd: string, branch: string): string | null => git(cwd, 'rev-parse', '--verify', '-q', `refs/heads/${branch}`) || null
