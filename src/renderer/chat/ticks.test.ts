import { describe, expect, it } from 'vitest'
import { noteKey, noteSent, tickCount } from './ticks'

describe('counting what happens in a chat, for a widget', () => {
  it('counts key presses and sends for each chat apart, as numbers only', () => {
    expect(tickCount('a1')).toEqual({ typing: 0, sent: 0 })
    noteKey('a1')
    noteKey('a1')
    noteSent('a1')
    noteKey('a2')
    expect(tickCount('a1')).toEqual({ typing: 2, sent: 1 })
    expect(tickCount('a2')).toEqual({ typing: 1, sent: 0 })
  })
  it('gives the same object until something changes, so a window that reads it is not redrawn for nothing', () => {
    const before = tickCount('a3')
    expect(tickCount('a3')).toBe(before)
    noteKey('a3')
    expect(tickCount('a3')).not.toBe(before)
  })
})
