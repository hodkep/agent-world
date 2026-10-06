import { existsSync, mkdirSync, symlinkSync } from 'node:fs'
import { lstat, mkdir, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import type { Account } from '../shared/types'

/** Each extra account keeps its sign-in, settings and conversations in a folder of its own under the app's home. */
export const accountDir = (home: string, id: string) => join(home, 'accounts', id)

/** The folder an agent's Claude runs in: this computer's own login (no folder named, nothing changed) or an account's. */
export function configDirFor(home: string, accounts: Account[], id: string | undefined): string | undefined {
  return id && accounts.some((a) => a.id === id) ? accountDir(home, id) : undefined
}

/** A short folder-safe id from the name the user typed, never one already taken. */
export function accountId(name: string, taken: string[]): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'account'
  let id = base
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`
  return id
}

/** What `claude auth status` prints: whether anyone is signed in, and who. Anything unreadable counts as signed out. */
export function parseAuthStatus(out: string): { loggedIn: boolean; email: string } {
  try {
    const j = JSON.parse(out) as { loggedIn?: unknown; email?: unknown }
    return { loggedIn: j.loggedIn === true, email: typeof j.email === 'string' ? j.email : '' }
  } catch {
    return { loggedIn: false, email: '' }
  }
}

// What the user keeps in their own Claude folder that every account should see, so editing it once is enough.
const SHARED = ['CLAUDE.md', 'skills', 'commands', 'agents']

/** Makes the account's folder and links your instructions, skills, commands and agents into it. The sign-in itself is never copied or linked. Returns nothing the user's own folder could lose: links only point at it. */
export async function prepareAccount(dir: string, claudeHome: string) {
  await mkdir(dir, { recursive: true })
  for (const name of SHARED) {
    const from = join(claudeHome, name)
    const to = join(dir, name)
    if (!existsSync(from)) continue
    if (await lstat(to).then(() => true, () => false)) continue
    await symlink(from, to).catch(() => undefined)
  }
}

/** Claude names a project's folder after its working directory with every odd character turned into a dash. */
export const slugOf = (path: string) => path.replace(/[^a-zA-Z0-9]/g, '-')

/** Lets a conversation continue under another account: its saved file appears in that account's folder as a link to the original, so both see one history. */
export function shareSession(fromProjects: string, toProjects: string, slug: string, sessionId: string) {
  const from = join(fromProjects, slug, `${sessionId}.jsonl`)
  const to = join(toProjects, slug, `${sessionId}.jsonl`)
  if (!existsSync(from) || existsSync(to)) return
  mkdirSync(join(toProjects, slug), { recursive: true })
  symlinkSync(from, to)
  // Its subagent transcripts live beside it in a folder of the same name.
  const sub = join(fromProjects, slug, sessionId)
  if (existsSync(sub) && !existsSync(join(toProjects, slug, sessionId))) symlinkSync(sub, join(toProjects, slug, sessionId))
}
