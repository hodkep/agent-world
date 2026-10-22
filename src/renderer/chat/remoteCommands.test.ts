import { describe, expect, it } from 'vitest'
import { remoteCommands } from './remoteCommands'

const names = (s: Parameters<typeof remoteCommands>[1]) => remoteCommands('ada', s).map((c) => c.name)

describe('remoteCommands: the palette verbs that apply to an agent\'s remote control', () => {
  it('offers only turning on while it is off', () => {
    expect(names({ state: 'off' })).toEqual(['remote-on'])
  })
  it('offers link, code and off once there is a link', () => {
    expect(names({ state: 'on', link: 'https://claude.ai/code/session_x' })).toEqual(['remote-link', 'remote-qr', 'remote-off'])
  })
  it('offers only turning off while starting or refused', () => {
    expect(names({ state: 'starting' })).toEqual(['remote-off'])
    expect(names({ state: 'unavailable', reason: 'No.' })).toEqual(['remote-off'])
  })
  it('names the agent in each description', () => {
    expect(remoteCommands('ada', { state: 'off' })[0]!.description).toBe('Turn on remote control for ada: continue it from your phone')
  })
})
