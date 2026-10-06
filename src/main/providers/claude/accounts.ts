import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, realpathSync, symlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { AgentRecord } from '../../../shared/types'
import type { AccountSupport } from '../ports'
import { projectSlug } from './history'

/** What `claude auth status` prints: whether anyone is signed in, and who. Anything unreadable counts as signed out. */
export function parseAuthStatus(out: string): { loggedIn: boolean; email: string } {
  try {
    const j = JSON.parse(out) as { loggedIn?: unknown; email?: unknown }
    return { loggedIn: j.loggedIn === true, email: typeof j.email === 'string' ? j.email : '' }
  } catch {
    return { loggedIn: false, email: '' }
  }
}

const projectsOf = (configDir: string | undefined) => join(configDir ?? join(homedir(), '.claude'), 'projects')

/** Lets a conversation continue under another config folder: its saved file appears there as a link to the original, so both see one history. */
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

const run = (file: string, args: string[], env: NodeJS.ProcessEnv) =>
  new Promise<string>((resolve) => execFile(file, args, { env, timeout: 15_000 }, (_err, stdout) => resolve(stdout)))

/** Claude Code keeps a login in the folder named by CLAUDE_CONFIG_DIR (its own is ~/.claude). */
export const claudeAccounts: AccountSupport = {
  ownHome: () => join(homedir(), '.claude'),
  shared: ['CLAUDE.md', 'skills', 'commands', 'agents'],
  env: (dir) => ({ CLAUDE_CONFIG_DIR: dir }),
  signInArgs: ['auth', 'login'],
  async status(bin, env, ask = run) {
    return parseAuthStatus(await ask(bin, ['auth', 'status'], env))
  },
  shareConversation(a: AgentRecord, from, to) {
    // Claude names the project's folder after the real path of its working directory.
    let real = a.cwd
    try {
      real = realpathSync(a.cwd)
    } catch {
      /* the folder is gone; there is nothing to share */
    }
    shareSession(projectsOf(from), projectsOf(to), projectSlug(real), a.sessionId)
  }
}
