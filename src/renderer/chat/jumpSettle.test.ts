import { describe, expect, it } from 'vitest'
import { SETTLE_MAX_MS, SETTLE_STABLE, settleStep } from './jumpSettle'

const at = (ms: number, height: number, off: number) => ({ ms, height, off })

describe('when a jump to a message has finished settling', () => {
  it('is not while the conversation is still changing height, however many frames have passed', () => {
    let s = settleStep(null, at(0, 1000, 0))
    for (let i = 1; i <= 40; i++) s = settleStep(s.state, at(i * 16, 1000 + i * 30, 0))
    expect(s.done).toBe(false)
  })

  it('is not while the message is still off the middle', () => {
    let s = settleStep(null, at(0, 1000, 12))
    for (let i = 1; i <= 40; i++) s = settleStep(s.state, at(i * 16, 1000, 12))
    expect(s.done).toBe(false)
  })

  it('is after the height and the place have been the same for a few frames in a row', () => {
    let s = settleStep(null, at(0, 1000, 0))
    for (let i = 1; i < SETTLE_STABLE; i++) {
      s = settleStep(s.state, at(i * 16, 1000, 0))
      expect(s.done).toBe(false)
    }
    s = settleStep(s.state, at(SETTLE_STABLE * 16, 1000, 0))
    expect(s.done).toBe(true)
  })

  it('starts counting again when the height changes late, as when a reply that was not drawn grows', () => {
    let s = settleStep(null, at(0, 1000, 0))
    for (let i = 1; i <= SETTLE_STABLE - 1; i++) s = settleStep(s.state, at(i * 16, 1000, 0))
    s = settleStep(s.state, at(200, 1400, 0))
    expect(s.done).toBe(false)
    for (let i = 1; i < SETTLE_STABLE; i++) s = settleStep(s.state, at(200 + i * 16, 1400, 0))
    expect(s.done).toBe(false)
    s = settleStep(s.state, at(200 + SETTLE_STABLE * 16, 1400, 0))
    expect(s.done).toBe(true)
  })

  it('gives up after a time, so a conversation that never stops growing does not hold the view for ever', () => {
    let s = settleStep(null, at(0, 1000, 0))
    s = settleStep(s.state, at(SETTLE_MAX_MS + 1, 5000, 40))
    expect(s.done).toBe(true)
  })
})
