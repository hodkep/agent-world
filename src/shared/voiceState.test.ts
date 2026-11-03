import { describe, expect, it } from 'vitest'
import { stepVoice, type VoiceEv, type VoiceState } from './voiceState'

const run = (from: VoiceState, ...evs: VoiceEv[]) => evs.reduce(stepVoice, from)

describe('the voice session states', () => {
  it('goes from idle through connecting to listening', () => {
    expect(run('idle', 'connect')).toBe('connecting')
    expect(run('idle', 'connect', 'ready')).toBe('listening')
  })
  it('speaks when audio comes and listens again when the turn is over', () => {
    expect(run('listening', 'audio')).toBe('speaking')
    expect(run('listening', 'audio', 'turnComplete')).toBe('listening')
  })
  it('listens at once when the person breaks in', () => {
    expect(run('speaking', 'interrupted')).toBe('listening')
  })
  it('thinks while a tool runs and speaks when the answer comes', () => {
    expect(run('listening', 'toolCall')).toBe('thinking')
    expect(run('listening', 'toolCall', 'toolDone')).toBe('thinking')
    expect(run('listening', 'toolCall', 'toolDone', 'audio')).toBe('speaking')
  })
  it('ends in an error that only a new connection clears', () => {
    expect(run('listening', 'fail')).toBe('error')
    expect(run('error', 'audio')).toBe('error')
    expect(run('error', 'connect')).toBe('connecting')
  })
  it('goes idle when ended, from anywhere', () => {
    for (const s of ['connecting', 'listening', 'thinking', 'speaking', 'error'] as VoiceState[]) expect(run(s, 'end')).toBe('idle')
  })
  it('ignores what makes no sense in the state it is in', () => {
    expect(run('idle', 'audio')).toBe('idle')
    expect(run('idle', 'turnComplete')).toBe('idle')
    expect(run('connecting', 'audio')).toBe('connecting')
  })
})
