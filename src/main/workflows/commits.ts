/** `git log --format=` for the fields parseCommitLog reads: sha, committer time (seconds), subject, tab-separated. */
export const LOG_FORMAT = '%H%x09%ct%x09%s'

export interface LoggedCommit {
  sha: string
  at: number
  subject: string
}

export function parseCommitLog(out: string): LoggedCommit[] {
  const commits: LoggedCommit[] = []
  for (const line of out.split('\n')) {
    const [sha, secs, ...rest] = line.split('\t')
    const at = Number(secs) * 1000
    if (sha && /^[0-9a-f]+$/.test(sha) && Number.isFinite(at) && rest.length) commits.push({ sha, at, subject: rest.join('\t') })
  }
  return commits
}
