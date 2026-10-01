import { describe, expect, it } from 'vitest'
import { bashTitle } from './titles'

describe('the title of a command card', () => {
  it('is the description the agent gave', () => expect(bashTitle({ command: 'ls src', description: 'List the source folder' })).toBe('List the source folder'))
  it('is the command itself, on one line, when there is no description', () => expect(bashTitle({ command: 'git status\n  --short' })).toBe('git status --short'))
  it('is cut short when long', () => {
    const t = bashTitle({ command: 'sed -n 596,665p src/renderer/App.tsx; grep -n "stage-wrap" src/renderer/App.tsx src/renderer/styles.css | head -20' })
    expect(t.endsWith('…')).toBe(true)
    expect(t.length).toBeLessThanOrEqual(72)
  })
  it('falls back to a plain word for an empty command', () => expect(bashTitle({})).toBe('a command'))
})
