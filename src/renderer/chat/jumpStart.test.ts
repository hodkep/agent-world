import { describe, expect, it } from 'vitest'
import { jumpStart } from './jumpStart'

// The tops of your messages, from the first, and where the middle of the view is.
const tops = [-1800, -1500, -1200, -800, -400, -100, 300, 669]

describe('which of your messages a keyboard jump starts from', () => {
  it('is the last one for Alt+Up when the conversation is at its end, whatever the layout shows at that moment', () => {
    // A late-measured reply has pushed the last message below the middle for a moment: the reader is still at the end.
    expect(jumpStart(tops, 478, -1, true)).toBe(7)
  })

  it('is the message just above the middle when the reader is somewhere in the conversation', () => {
    expect(jumpStart(tops, 478, -1, false)).toBe(6)
    expect(jumpStart(tops, 0, -1, false)).toBe(5)
  })

  it('is the first one when every message is below the middle', () => {
    expect(jumpStart([200, 500], 100, -1, false)).toBe(0)
  })

  it('is the message just below the middle for Alt+Down, or nothing past the last', () => {
    expect(jumpStart(tops, 0, 1, false)).toBe(6)
    expect(jumpStart(tops, 1000, 1, false)).toBeNull()
  })

  it('is nothing when there are no messages', () => {
    expect(jumpStart([], 0, -1, true)).toBeNull()
  })
})
