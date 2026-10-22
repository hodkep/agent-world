import { describe, expect, it } from 'vitest'
import { claudeRemote } from './remote'

describe('claude remote control, read from the screen', () => {
  it('finds the link the program prints once the session is reachable', () => {
    const screen = ['● ready', '  /remote-control is active · Code in CLI or at https://claude.ai/code/session_01AbCd9-xyz', '❯ '].join('\n')
    expect(claudeRemote(screen)).toEqual({ link: 'https://claude.ai/code/session_01AbCd9-xyz' })
  })

  it('says nothing while the program has not printed anything about it', () => {
    expect(claudeRemote('Welcome\n❯ ')).toBeNull()
  })

  it('gives the program\'s own words when remote control cannot be used on this account', () => {
    expect(claudeRemote('Remote Control is not available for API key accounts.\n❯ ')).toEqual({ unavailable: 'Remote Control is not available for API key accounts.' })
  })
})
