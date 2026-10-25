import { describe, expect, it } from 'vitest'
import { signInsNeeded, withAccounts } from './readiness'

describe('a program whose own login is not signed in', () => {
  const own = { state: 'needs-sign-in', version: '2.1.310', path: '/bin/claude', hint: 'sign in' } as const
  it('is ready when an account kept for it is signed in, so agents can be hired and its tanks drawn', () => {
    expect(withAccounts(own, 1)).toEqual({ state: 'ready', version: '2.1.310', path: '/bin/claude' })
  })
  it('still needs a sign-in when no account is signed in either', () => {
    expect(withAccounts(own, 0)).toBe(own)
  })
  it('is left as it is when it is not about a sign-in at all', () => {
    const missing = { state: 'not-installed', hint: 'install it' } as const
    expect(withAccounts(missing, 2)).toBe(missing)
    const ready = { state: 'ready', version: '1' } as const
    expect(withAccounts(ready, 0)).toBe(ready)
  })
})

describe('the logins that wait for a sign-in', () => {
  it('counts each one that is not signed in', () => {
    expect(signInsNeeded([{ loggedIn: false }, { loggedIn: true }, { loggedIn: true }])).toBe(1)
    expect(signInsNeeded([{ loggedIn: true }])).toBe(0)
    expect(signInsNeeded([])).toBe(0)
  })
})
