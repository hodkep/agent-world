/** Background asks for a program's limits are this far apart: each one starts the whole program with its MCP servers, which macOS counts as the app's energy. */
export const LIMITS_FRESH_MS = 15 * 60_000

/** Whether a login's limits are worth asking the program for: not when its agents reported lately (they already say), unless the person asked for a refresh. */
export const needsProbe = (o: { live: boolean; reportedAt: number | undefined; forced: boolean; now: number }) =>
  o.forced || !o.live || o.reportedAt === undefined || o.now - o.reportedAt >= LIMITS_FRESH_MS
