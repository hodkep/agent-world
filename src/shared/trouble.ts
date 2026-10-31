/** What a failed command is called in a run's story: git's own reasons, a hook's refusal, or the kind of check that failed. */
export type TroubleLabel = 'identity' | 'network' | 'permission' | 'hook' | 'tests' | 'build' | 'lint' | 'other'

export interface Trouble {
  label: TroubleLabel
  /** The command, cut short. */
  command: string
  /** The end of what it said, cut short. */
  error: string
}

const GIT = /(^|[\s;&|(])git\s/
const TESTS = /\b(vitest|jest|pytest|mocha|playwright test|node --test)\b|\b(npm|pnpm|yarn|bun)\s+(run\s+)?test\b|\bcargo test\b|\bgo test\b|\bmake test\b|\bdotnet test\b/
const BUILD = /\b(npm|pnpm|yarn|bun)\s+(run\s+)?build\b|\btsc\b|\bcargo build\b|\bgo build\b|\bmake build\b|\b(electron-)?vite build\b|\bwebpack\b/
const LINT = /\beslint\b|\bprettier\b|\b(npm|pnpm|yarn|bun)\s+(run\s+)?lint\b|\bruff\b|\bgolangci/

const IDENTITY = /author identity unknown|please tell me who you are|unable to auto-detect (an )?email|empty ident name|no (email|name) was given/i
const NETWORK = /could not resolve host|connection (timed out|refused|reset)|network is unreachable|unable to access|early eof|operation timed out|temporary failure in name resolution/i
const PERMISSION = /permission (to .+ )?denied|authentication failed|could not read (username|password)|access denied|publickey|repository not found|403/i
const HOOK = /agent world: |hook (declined|failed|rejected)|pre-(commit|push)|commit-msg|husky/i

/**
 * Whether a command that failed belongs in the story of a run, and what it is called: git commands (a commit or a push that could not go through, and why) and the commands
 * that test, build or lint. Anything else that failed is the agent's own business, so null.
 */
export function troubleOf(command: string, error: string): Trouble | null {
  const cmd = command.trim().split('\n')[0]!.slice(0, 200)
  const err = error.trim().slice(-600)
  if (GIT.test(command)) {
    const label: TroubleLabel = HOOK.test(error) ? 'hook' : IDENTITY.test(error) ? 'identity' : PERMISSION.test(error) ? 'permission' : NETWORK.test(error) ? 'network' : 'other'
    return { label, command: cmd, error: err }
  }
  if (TESTS.test(command)) return { label: 'tests', command: cmd, error: err }
  if (BUILD.test(command)) return { label: 'build', command: cmd, error: err }
  if (LINT.test(command)) return { label: 'lint', command: cmd, error: err }
  return null
}
