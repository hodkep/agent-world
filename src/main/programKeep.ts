import type { Detection } from '../shared/types'
import { shared } from './shared'

/** One rule for how stale what the app knows about a program may be: whether it is ready and what its limits are. Each ask starts the whole program, which macOS counts as the app's energy. */
export const PROGRAMS_FRESH_MS = 15 * 60_000

type Run = (file: string, args: string[]) => Promise<string>

/**
 * What the app has asked the programs lately, kept so one question is one launch: agy's readiness check and its limits read are the same `-p /usage`,
 * and Claude's version is asked by the readiness check of every caller. `refresh()` is for the person's acts (Check again, a refresh of the limits,
 * an account switch, an ask that finds nothing ready): what was kept before it is asked again.
 */
export function programKeep(now: () => number = Date.now) {
  const output = shared<string>(PROGRAMS_FRESH_MS, now)
  const detection = shared<Detection>(PROGRAMS_FRESH_MS, now)
  return {
    /** `run` with its answers kept; `login` keeps another login of the same program apart (its folder and environment differ). */
    ask: (run: Run, login = ''): Run => (file, args) => output(`${login}\0${file}\0${args.join('\0')}`, () => run(file, args)),
    detect: (programId: string, look: () => Promise<Detection>) => detection(programId, look),
    refresh: () => (output.clear(), detection.clear())
  }
}
