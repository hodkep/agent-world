import type { Detection } from '../shared/types'

/**
 * A program whose own login on this computer is not signed in is still usable when an account kept for it is:
 * agents are hired on those, and its allowances are read from them. `signedIn` counts those accounts.
 */
export function withAccounts(d: Detection, signedIn: number): Detection {
  if (d.state !== 'needs-sign-in' || signedIn <= 0) return d
  const { hint: _hint, ...ready } = d
  return { ...ready, state: 'ready' }
}

/** How many of the logins listed (the program's own and each account) are waiting for a sign-in. */
export const signInsNeeded = (logins: { loggedIn: boolean }[]): number => logins.filter((l) => !l.loggedIn).length
