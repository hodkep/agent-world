import { describe, expect, it } from 'vitest'
import { remoteState } from './remoteState'

describe('remoteState: what an agent\'s remote control is doing', () => {
  it('is off when the agent was not asked for it, whatever the screen says', () => {
    expect(remoteState(false, null)).toEqual({ state: 'off' })
    expect(remoteState(undefined, { link: 'https://claude.ai/code/session_x' })).toEqual({ state: 'off' })
  })
  it('is starting until the program says anything about it', () => {
    expect(remoteState(true, null)).toEqual({ state: 'starting' })
  })
  it('is on with its link once the program prints it', () => {
    expect(remoteState(true, { link: 'https://claude.ai/code/session_x' })).toEqual({ state: 'on', link: 'https://claude.ai/code/session_x' })
  })
  it('is unavailable with the program\'s own reason when it refuses', () => {
    expect(remoteState(true, { unavailable: 'Remote Control is not available for API key accounts.' })).toEqual({ state: 'unavailable', reason: 'Remote Control is not available for API key accounts.' })
  })
})
