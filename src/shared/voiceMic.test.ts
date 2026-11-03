import { describe, expect, it } from 'vitest'
import { holdHint, micAction } from './voiceMic'

describe('telling the person whether the microphone is being heard while they hold the key', () => {
  it('says nothing while the key was only just pressed', () => {
    expect(holdHint({ heldMs: 1500, peak: 0 })).toBe('ok')
  })
  it('says the microphone gives no sound once it has been held for two seconds with nothing heard', () => {
    expect(holdHint({ heldMs: 2000, peak: 0.004 })).toBe('silent')
  })
  it('is satisfied as soon as any speech-sized sound has been heard in the hold', () => {
    expect(holdHint({ heldMs: 6000, peak: 0.2 })).toBe('ok')
  })
})

describe('what letting go of the microphone button means', () => {
  it('a long hold was push to talk: it ends when the button comes up', () => {
    expect(micAction({ handsFree: false, heldMs: 900 })).toBe('end-push')
  })
  it('a quick tap turns the microphone on for good: hands-free', () => {
    expect(micAction({ handsFree: false, heldMs: 120 })).toBe('hands-free-on')
  })
  it('any press while it is on turns it off again', () => {
    expect(micAction({ handsFree: true, heldMs: 90 })).toBe('hands-free-off')
    expect(micAction({ handsFree: true, heldMs: 2000 })).toBe('hands-free-off')
  })
})
