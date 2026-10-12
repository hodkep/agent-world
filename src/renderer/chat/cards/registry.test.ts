import { beforeEach, describe, expect, it } from 'vitest'
import { registerToolCard, resetToolCards, toolCardFor, type ToolCardModule } from './registry'

const mod = (id: string, names: string[]): ToolCardModule => ({ id, match: (c) => names.includes(c.name), Card: () => null })

describe('the tool card registry', () => {
  beforeEach(resetToolCards)
  it('gives the card that owns a call, and nothing for a call no card owns', () => {
    registerToolCard(mod('a', ['one']))
    registerToolCard(mod('b', ['two']))
    expect(toolCardFor({ name: 'two', input: {} })?.id).toBe('b')
    expect(toolCardFor({ name: 'three', input: {} })).toBeUndefined()
  })
  it('lets the first registered card win when two claim a call', () => {
    registerToolCard(mod('first', ['x']))
    registerToolCard(mod('second', ['x']))
    expect(toolCardFor({ name: 'x', input: {} })?.id).toBe('first')
  })
  it('ignores a second registration of the same card, so loading a module twice is harmless', () => {
    registerToolCard(mod('a', ['one']))
    registerToolCard(mod('a', ['other']))
    expect(toolCardFor({ name: 'one', input: {} })?.id).toBe('a')
    expect(toolCardFor({ name: 'other', input: {} })).toBeUndefined()
  })
})
