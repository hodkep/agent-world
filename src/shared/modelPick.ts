import type { ProviderId } from './types'

/** A model chosen from a list grouped by program is one value: the program and its model ("agy|gemini-3.8-flash-high"). */
export const pickValue = (provider: ProviderId | '', model: string) => `${provider || 'claude'}|${model}`

export function parsePick(value: string): { provider: ProviderId; model: string } {
  const at = value.indexOf('|')
  const provider = at > 0 ? value.slice(0, at) : 'claude'
  return { provider: provider === 'agy' ? 'agy' : 'claude', model: at > 0 ? value.slice(at + 1) : value }
}

/** What Settings keeps for a job's model: Claude's stays a plain alias as before; another program's names its program. */
export const storePick = (provider: ProviderId, model: string) => (model === '' ? '' : provider === 'claude' ? model : `${provider}|${model}`)
