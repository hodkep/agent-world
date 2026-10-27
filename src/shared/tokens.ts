/**
 * Tokens as a program counts them for one request. `input` is what was read fresh; a program with a cache says how much it read
 * from it and wrote to it. A figure the program does not give is left out, never zero, so "none" and "not reported" stay apart.
 */
export interface TokenUse {
  input: number
  cacheRead?: number
  cacheWrite?: number
  output: number
}

/** One request to the model, as a provider's usage feed reports it. `id` is the program's own (a request id, a step number): the same id is never counted twice. */
export interface UsageRecord extends TokenUse {
  at: number
  id: string
  model: string
}

export const tokenTotal = (u: TokenUse) => u.input + (u.cacheRead ?? 0) + (u.cacheWrite ?? 0) + u.output

/** The part of what was read that came from the cache (0 to 1); null when the program does not say, or nothing was read. */
export function cacheShare(u: TokenUse): number | null {
  if (u.cacheRead === undefined) return null
  const read = u.input + u.cacheRead + (u.cacheWrite ?? 0)
  return read > 0 ? u.cacheRead / read : null
}

/** A stretch of tokens (a week, an account's week) by kind. `legacy` is input and output counted before requests were exact: no split, and no cache. */
export interface TokenParts {
  input: number
  cacheRead: number
  cacheWrite: number
  output: number
  legacy: number
}

export const noParts = (): TokenParts => ({ input: 0, cacheRead: 0, cacheWrite: 0, output: 0, legacy: 0 })
export const partsTotal = (p: TokenParts) => p.input + p.cacheRead + p.cacheWrite + p.output + p.legacy

/** What a ledger event adds to a week's parts: an exact request by its kinds, an old count of input and output as `legacy`. */
export function partsOf(e: { k: 'req'; input: number; cacheRead?: number; cacheWrite?: number; output: number } | { k: 'tokens'; input: number; output: number }): TokenParts {
  if (e.k === 'tokens') return { ...noParts(), legacy: e.input + e.output }
  return { input: e.input, cacheRead: e.cacheRead ?? 0, cacheWrite: e.cacheWrite ?? 0, output: e.output, legacy: 0 }
}

export const addParts = (to: TokenParts, p: TokenParts) => {
  to.input += p.input
  to.cacheRead += p.cacheRead
  to.cacheWrite += p.cacheWrite
  to.output += p.output
  to.legacy += p.legacy
}

/**
 * The change in tokens from the week before, in percent. Last week counted the old way has input and output only, so against a week with a
 * cache the two are compared on input and output alone (`basis: 'io'`), not on 9,500 tokens that have nothing to be compared with.
 * Null when there is nothing before to compare with.
 */
export function tokenChange(now: TokenParts, before: TokenParts): { pct: number; basis: 'all' | 'io' } | null {
  const io = before.legacy > 0 && now.cacheRead + now.cacheWrite > 0
  const mine = io ? now.input + now.output + now.legacy : partsTotal(now)
  const then = io ? before.input + before.output + before.legacy : partsTotal(before)
  return then > 0 ? { pct: Math.round(((mine - then) / then) * 100), basis: io ? 'io' : 'all' } : null
}
