import type { AgentRecord, ProviderId } from '../../shared/types'
import type { Provider } from './ports'
import { agy } from './agy'
import { claude } from './claude'

/** The only place providers are named. */
const all: Provider[] = [claude, agy]

export const providers = (): readonly Provider[] => all
export const providerById = (id: ProviderId): Provider => all.find((p) => p.id === id) ?? claude
/** Agents saved before providers existed have none: they are Claude Code. */
export const providerOf = (a: Pick<AgentRecord, 'provider'>): Provider => providerById(a.provider ?? 'claude')
