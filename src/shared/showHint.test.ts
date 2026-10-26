import { describe, expect, it } from 'vitest'
import { SHOW_HINT } from './showHint'

describe('what every agent is told about showing things in the chat', () => {
  it('names the diagram and form blocks the chat draws, and says to choose them without being asked', () => {
    expect(SHOW_HINT).toMatch(/```mermaid/)
    expect(SHOW_HINT).toMatch(/```a2ui/)
    expect(SHOW_HINT).toMatch(/without being asked|unprompted|on your own/i)
    expect(SHOW_HINT).toMatch(/ASCII/)
  })
  it('stays short, since every agent carries it in every conversation', () => {
    expect(SHOW_HINT.length).toBeLessThan(1500)
  })
})
