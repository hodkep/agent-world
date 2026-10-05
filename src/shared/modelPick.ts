import { DEFAULT_PROVIDER, type ProviderId, isProviderId } from './types'

/** A model chosen from a list grouped by program is one value: the program and its model ("agy|gemini-3.8-flash-high"). */
export const pickValue = (provider: ProviderId | '', model: string) => `${provider || DEFAULT_PROVIDER}|${model}`

export function parsePick(value: string): { provider: ProviderId; model: string } {
  const at = value.indexOf('|')
  const named = at > 0 ? value.slice(0, at) : DEFAULT_PROVIDER
  return { provider: isProviderId(named) ? named : DEFAULT_PROVIDER, model: at > 0 ? value.slice(at + 1) : value }
}

/** What Settings keeps for a job's model: the default program's stays a plain alias as before; another program's names its program. */
export const storePick = (provider: ProviderId, model: string) => (model === '' ? '' : provider === DEFAULT_PROVIDER ? model : `${provider}|${model}`)
