// Names end up inside commands the reviewer is told to run, so keep only characters a branch or path can safely hold.
const safe = (s: string) => s.replace(/[^A-Za-z0-9._\/@+-]/g, '_')

/** The message that hands one agent's branch to another for review. */
export function reviewRequest(author: string, branch: string, base: string, worktree: string): string {
  const b = safe(branch)
  const t = safe(base)
  return [
    `${author} asks you to review their work on branch ${b}.`,
    `See what changed with: git diff ${t}...${b} (add --stat for a summary). Uncommitted edits are in ${safe(worktree)}: read them with git -C ${safe(worktree)} diff.`,
    'Look for bugs, missed edge cases, risky changes, and missing tests. Do not edit, commit or run anything that changes files.',
    `When done, send a short verdict with concrete findings to ${author} using send_message with to="${author}".`
  ].join(' ')
}
