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
