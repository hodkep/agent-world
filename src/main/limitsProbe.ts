import { PROGRAMS_FRESH_MS } from './programKeep'

/** Background asks for a program's limits are this far apart: the one rule for everything asked of a program (see programKeep). */
export const LIMITS_FRESH_MS = PROGRAMS_FRESH_MS

/** Whether a login's limits are worth asking the program for: not when its agents reported lately (they already say), unless the person asked for a refresh. */
export const needsProbe = (o: { live: boolean; reportedAt: number | undefined; forced: boolean; now: number }) =>
  o.forced || !o.live || o.reportedAt === undefined || o.now - o.reportedAt >= LIMITS_FRESH_MS
