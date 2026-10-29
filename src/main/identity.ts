import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** A GitHub login plus the name and email on commits. Two profiles may share a login: one email per team. */
export interface Profile {
  id: string
  name: string
  login: string
  gitName: string
  gitEmail: string
}

/** The profiles, and the one picked for each project folder. A project with none uses the machine's own gh and git settings. */
export interface Identity {
  profiles: Profile[]
  byProject: Record<string, string>
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** Anything unreadable falls back to empty, so a hand-edited file never breaks start-up. */
export function cleanIdentity(raw: unknown): Identity {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const profiles: Profile[] = []
  for (const o of Array.isArray(r.profiles) ? r.profiles : []) {
    const p = { id: str(o?.id, 40), name: str(o?.name, 60), login: str(o?.login, 60), gitName: str(o?.gitName, 80), gitEmail: str(o?.gitEmail, 120) }
    if (p.id && p.name && p.login && /^[a-z0-9][a-z0-9-]*$/.test(p.id) && p.gitEmail.includes('@') && !profiles.some((x) => x.id === p.id)) profiles.push(p)
  }
  const picked = (r.byProject && typeof r.byProject === 'object' ? r.byProject : {}) as Record<string, unknown>
  const byProject = Object.fromEntries(Object.entries(picked).filter(([, id]) => typeof id === 'string' && profiles.some((p) => p.id === id))) as Record<string, string>
  return { profiles, byProject }
}

/** The profile for a folder: the one picked for the deepest project that is the folder or holds it (an agent's worktree, a repo inside a multi-repo project). */
export function profileFor(id: Identity, folder: string): Profile | undefined {
  const at = Object.keys(id.byProject)
    .filter((p) => folder === p || folder.startsWith(p.endsWith('/') || p.endsWith('\\') ? p : `${p}/`) || folder.startsWith(`${p}\\`))
    .sort((a, b) => b.length - a.length)[0]
  return id.profiles.find((p) => p.id === id.byProject[at ?? ''])
}

/** The environment that makes gh and git act as the profile. The token is only added when the login is signed in; who commits is set either way. */
export function identityEnv(profile: Profile | undefined, token: string | undefined): Record<string, string> {
  if (!profile) return {}
  return {
    ...(token ? { GH_TOKEN: token, GITHUB_TOKEN: token } : {}),
    GIT_AUTHOR_NAME: profile.gitName,
    GIT_AUTHOR_EMAIL: profile.gitEmail,
    GIT_COMMITTER_NAME: profile.gitName,
    GIT_COMMITTER_EMAIL: profile.gitEmail
  }
}

/** The github.com logins gh can use (from `gh auth status --json hosts`), and which one it has active. Older gh without --json reads as none. */
export function parseGhLogins(out: string): { login: string; active: boolean }[] {
  try {
    const rows = (JSON.parse(out) as { hosts?: Record<string, unknown> }).hosts?.['github.com']
    return (Array.isArray(rows) ? rows : []).filter((r) => r?.state === 'success' && typeof r.login === 'string').map((r) => ({ login: r.login as string, active: r.active === true }))
  } catch {
    return []
  }
}

/** One login's token, asked of gh when an agent or terminal starts: it never switches gh's active login and is never kept. */
export async function ghToken(login: string, run: (file: string, args: string[]) => Promise<string>): Promise<string | undefined> {
  try {
    return (await run('gh', ['auth', 'token', '--user', login])).trim() || undefined
  } catch {
    return undefined
  }
}

export function loadIdentity(file: string): Identity {
  try {
    return cleanIdentity(JSON.parse(readFileSync(file, 'utf8')))
  } catch {
    return cleanIdentity(null)
  }
}

export function saveIdentity(file: string, id: Identity) {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(id, null, 2))
  renameSync(tmp, file)
}
