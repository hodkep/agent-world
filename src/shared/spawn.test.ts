import { describe, expect, it } from 'vitest'
import { isAwaitCall, isSpawnCall, modelLabel, spawnLabel } from './spawn'

describe('spawn names', () => {
  it('knows the calls that start and wait for a subagent, however the program names them', () => {
    expect(isSpawnCall('mcp__agent-world__spawn_subagent')).toBe(true)
    expect(isSpawnCall('spawn_subagent')).toBe(true)
    expect(isSpawnCall('Agent')).toBe(false)
    expect(isAwaitCall('mcp__agent-world__await_subagents')).toBe(true)
  })
  it('shortens a task to a line', () => {
    expect(spawnLabel('Read  a\nb')).toBe('Read a b')
  })
})

describe('modelLabel', () => {
  it('turns the ids Claude saves into the names it shows', () => {
    expect(modelLabel('claude-sonnet-5-5')).toBe('Sonnet 5.5')
    expect(modelLabel('claude-opus-4-1-20250805')).toBe('Opus 4.1')
    expect(modelLabel('claude-haiku-5-5')).toBe('Haiku 5.5')
    expect(modelLabel('claude-opus-4-6-thinking')).toBe('Opus 4.6')
  })
  it('keeps a name that is already one, and has nothing for no model', () => {
    expect(modelLabel('Gemini 3.8 Flash')).toBe('Gemini 3.8 Flash')
    expect(modelLabel('gemini-3.8-flash-high')).toBe('gemini-3.8-flash-high')
    expect(modelLabel('')).toBe('')
    expect(modelLabel(undefined)).toBe('')
  })
})
