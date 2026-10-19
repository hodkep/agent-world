import { describe, expect, it } from 'vitest'
import { DID_NOT_TAKE, cancelNeed } from './needCancel'

// A fake sleep must give the event loop a real turn, or a loop that awaits it never lets anything else run.
const sleep = () => new Promise<void>((r) => setTimeout(r, 0))

function make(closesAfter: number | null) {
  const s = { pressed: 0, polls: 0, inFlight: new Set<string>() }
  const o = {
    id: 'a1',
    inFlight: s.inFlight,
    isOpen: () => (s.pressed === 0 ? true : closesAfter === null ? true : ++s.polls <= closesAfter),
    press: () => void s.pressed++,
    sleep,
    timeoutMs: 50,
    pollMs: 1
  }
  return { s, o }
}

describe('cancelling a question or plan the way Esc does', () => {
  it('writes Esc once, however many times it is asked while the first is under way', async () => {
    const { s, o } = make(3)
    await Promise.all([cancelNeed(o), cancelNeed(o), cancelNeed(o)])
    expect(s.pressed).toBe(1)
    expect(s.inFlight.size).toBe(0)
  })
  it('is done when the card has closed', async () => {
    const { o } = make(2)
    await expect(cancelNeed(o)).resolves.toBeUndefined()
  })
  it('says the program did not take it when the card is still there after the wait, and can be tried again', async () => {
    const { s, o } = make(null)
    await expect(cancelNeed(o)).rejects.toThrow(DID_NOT_TAKE)
    expect(s.inFlight.size).toBe(0)
    await expect(cancelNeed(o)).rejects.toThrow(DID_NOT_TAKE)
    expect(s.pressed).toBe(2)
  })
  it('refuses a card that is already gone, pressing nothing', async () => {
    const s = { pressed: 0 }
    await expect(cancelNeed({ id: 'a1', inFlight: new Set(), isOpen: () => false, press: () => void s.pressed++, sleep })).rejects.toThrow('no longer open')
    expect(s.pressed).toBe(0)
  })
})
