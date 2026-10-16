import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Detection } from '../../../shared/types'

export interface AuthStatus {
  loggedIn: boolean
  apiProvider?: string
  configDirectory?: string
}

/** What `claude auth status` printed; null when it printed nothing readable (an older Claude Code has no such command). */
export function parseStatus(out: string): AuthStatus | null {
  try {
    const j = JSON.parse(out) as { loggedIn?: unknown; apiProvider?: unknown; configDirectory?: unknown }
    if (!j || typeof j !== 'object' || typeof j.loggedIn !== 'boolean') return null
    return { loggedIn: j.loggedIn, ...(typeof j.apiProvider === 'string' && { apiProvider: j.apiProvider }), ...(typeof j.configDirectory === 'string' && { configDirectory: j.configDirectory }) }
  } catch {
    return null
  }
}

/** The files Claude Code may keep what it knows about its first run in: .claude.json in its config folder, and for the default folder, in the home folder. */
export function configJsonPaths(configDirectory: string, home: string): string[] {
  const own = join(configDirectory, '.claude.json')
  return configDirectory === join(home, '.claude') ? [own, join(home, '.claude.json')] : [own]
}

export type Onboarding = 'done' | 'not-done' | 'unknown'

/** Whether Claude Code wrote down that the first questions were answered (`hasCompletedOnboarding`); unknown when there is nothing to read. */
export function onboardingOf(json: string | null): Onboarding {
  if (!json) return 'unknown'
  try {
    const j = JSON.parse(json) as { hasCompletedOnboarding?: unknown }
    return j && typeof j === 'object' ? (j.hasCompletedOnboarding === true ? 'done' : 'not-done') : 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * Whether Claude Code is ready for an agent. A Claude Code nobody is signed in to, or one whose first questions (text style, security notes) were never
 * answered, would ask them in the middle of a chat, so setup does that first, in a terminal. What cannot be told does not hold anyone back, and neither
 * does a provider of its own (Bedrock, Vertex) that has no login to ask for.
 */
export function signInState(status: AuthStatus | null, onboarding: Onboarding): { state: 'ready' } | { state: 'needs-sign-in'; hint: string } {
  if (!status) return { state: 'ready' }
  if (!status.loggedIn) {
    if (status.apiProvider && status.apiProvider !== 'firstParty') return { state: 'ready' }
    return { state: 'needs-sign-in', hint: 'Claude Code is installed but not signed in. Open a terminal below and sign in with your own account; its first run also asks a few questions, such as the text style.' }
  }
  if (onboarding === 'not-done') return { state: 'needs-sign-in', hint: "Claude Code is signed in, but its first-run questions (text style, security notes) have not been answered yet. Open a terminal below and answer them once; it takes a moment." }
  return { state: 'ready' }
}

const ask = (file: string, args: string[]) => new Promise<string>((resolve) => execFile(file, args, { timeout: 15_000 }, (_err, stdout) => resolve(stdout)))

interface Deps {
  /** Runs it with `--version` (to see that it runs). */
  run: (file: string, args: string[]) => Promise<string>
  /** What `claude auth status` printed. */
  status?: (bin: string) => Promise<string>
  /** The text of a file, or null when there is none (read only: Claude's own configuration is never changed). */
  readJson?: (path: string) => string | null
  home?: string
}

const readText = (p: string) => {
  try {
    return readFileSync(p, 'utf8')
  } catch {
    return null
  }
}

/** Finds Claude Code: whether it runs, whether someone is signed in and the first questions were answered, and what to tell the person if not. */
export async function detectClaude(bin: string, deps: Deps): Promise<Detection> {
  let out: string
  try {
    out = await deps.run(bin, ['--version'])
  } catch {
    return { state: 'not-installed', hint: 'Not found on your PATH or the usual places. Install it, or set where it is in Settings.', install: 'curl -fsSL https://claude.ai/install.sh | bash' }
  }
  const version = /\d+\.\d+\.\d+/.exec(out)?.[0]
  const status = parseStatus(await (deps.status ?? ((b: string) => ask(b, ['auth', 'status'])))(bin).catch(() => ''))
  const home = deps.home ?? homedir()
  const read = deps.readJson ?? readText
  let onboarding: Onboarding = 'unknown'
  if (status?.loggedIn && status.configDirectory) for (const p of configJsonPaths(status.configDirectory, home)) {
    const o = onboardingOf(read(p))
    if (o !== 'unknown') {
      onboarding = o
      break
    }
  }
  const s = signInState(status, onboarding)
  return s.state === 'ready' ? { state: 'ready', version, path: bin } : { state: 'needs-sign-in', version, path: bin, hint: s.hint }
}
