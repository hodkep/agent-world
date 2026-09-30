import { describe, expect, it } from 'vitest'
import { autoUnavailable, readMode, setMode } from './modes'

const foot = (line: string) => `────────\n  Agent World · Haiku 4.5\n  ${line}\n`

describe('reading Claude\'s permission mode from its screen', () => {
  it('names the mode in the footer', () => {
    expect(readMode(foot('⏸ manual mode on · ← 2 agents'))).toBe('default')
    expect(readMode(foot('⏵⏵ accept edits on (shift+tab to cycle) · ← 2 agents'))).toBe('acceptEdits')
    expect(readMode(foot('⏸ plan mode on (shift+tab to cycle)'))).toBe('plan')
    expect(readMode(foot('⏵⏵ auto mode on (shift+tab to cycle)'))).toBe('auto')
    expect(readMode(foot('⏵⏵ bypass permissions on (shift+tab to cycle)'))).toBe('bypassPermissions')
  })

  it('is null when the footer shows none (a menu is open, or the screen is something else)', () => {
    expect(readMode('❯ hello\n')).toBeNull()
  })
})

// A stand-in for Claude's footer: Shift+Tab moves through its cycle.
function fake(cycle: string[], start: number, ignore = 0) {
  let at = start
  let presses = 0
  const lines: Record<string, string> = { default: '⏸ manual mode on', acceptEdits: '⏵⏵ accept edits on (shift+tab to cycle)', plan: '⏸ plan mode on (shift+tab to cycle)', auto: '⏵⏵ auto mode on (shift+tab to cycle)' }
  return {
    io: {
      screen: () => foot(lines[cycle[at]!]!),
      // The first `ignore` presses are swallowed, like a key that arrives while Claude is busy drawing.
      write: () => void (presses++ >= ignore && (at = (at + 1) % cycle.length)),
      sleep: async () => {}
    },
    presses: () => presses
  }
}

describe('switching to a permission mode', () => {
  it('presses Shift+Tab until the footer shows the wanted mode', async () => {
    const f = fake(['default', 'acceptEdits', 'plan'], 0)
    expect(await setMode(f.io, 'plan')).toBe(true)
    expect(f.presses()).toBe(2)
  })

  it('does nothing when already there', async () => {
    const f = fake(['default', 'acceptEdits', 'plan'], 2)
    expect(await setMode(f.io, 'plan')).toBe(true)
    expect(f.presses()).toBe(0)
  })

  it('keeps going past a swallowed key, and gives up on a mode that is not in the cycle', async () => {
    expect(await setMode(fake(['default', 'acceptEdits', 'plan'], 0, 1).io, 'acceptEdits')).toBe(true)
    const f = fake(['default', 'acceptEdits', 'plan'], 0)
    expect(await setMode(f.io, 'auto')).toBe(false)
    expect(f.presses()).toBeLessThanOrEqual(8)
  })

  it('does not press anything when the footer cannot be read', async () => {
    let pressed = 0
    expect(await setMode({ screen: () => '❯ hi', write: () => void pressed++, sleep: async () => {} }, 'plan')).toBe(false)
    expect(pressed).toBe(0)
  })
})

describe('auto mode availability', () => {
  it('notices the footer saying Auto is unavailable', () => {
    expect(autoUnavailable('  ⏸ manual mode on (shift+tab to cycle) · auto mode unavailable')).toBe(true)
    expect(autoUnavailable('  ⏸ manual mode on')).toBe(false)
  })
})
