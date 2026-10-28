import type { ProviderId } from './types'

/** What a program's own login on this computer is called until the person names it. */
export const OWN_NAME = 'This computer'

export const ownName = (names: Partial<Record<ProviderId, string>> | undefined, provider: string) => names?.[provider as ProviderId] ?? OWN_NAME
