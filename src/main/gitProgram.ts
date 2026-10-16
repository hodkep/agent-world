import type { GitProgram } from './gitBinary'

let current: GitProgram | null = null

/** The git the app runs, chosen once at start (see resolveGit); null goes back to plain `git` on the path. */
export function useGit(g: GitProgram | null) {
  current = g
}

export const gitProgram = (): GitProgram | null => current

/** What to run for git: the chosen program, or plain `git`. */
export const gitBin = (): string => current?.bin ?? 'git'

/** The environment for running git: the app's own, with what a bundled git needs added. */
export const gitProcessEnv = (): NodeJS.ProcessEnv => ({ ...process.env, ...(current?.env ?? {}) })
