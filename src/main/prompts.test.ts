import { describe, expect, it } from 'vitest'
import { answerTrust, trustPrompt } from './prompts'

// Screen text as Claude Code 2.1 renders it, with ANSI colour codes like the real PTY stream.
const screen = (cursorOnYes: boolean) =>
  [
    '\x1b[1m Accessing workspace:\x1b[22m',
    ' /Users/me/.agent-world/worktrees/shop-api-1234/ada',
    ' Quick safety check: Is this a project you created or one you trust?',
    ` ${cursorOnYes ? '  ' : '\x1b[36m❯\x1b[39m '}No, exit`,
    ` ${cursorOnYes ? '\x1b[36m❯\x1b[39m ' : '  '}Yes, I trust this folder`,
    ' Enter to confirm · Esc to cancel'
  ].join('\r\n')

describe('workspace trust prompt', () => {
  it('detects the prompt and which option is highlighted', () => {
    expect(trustPrompt(screen(false))).toEqual({ path: '/Users/me/.agent-world/worktrees/shop-api-1234/ada', highlighted: 'no' })
    expect(trustPrompt(screen(true))?.highlighted).toBe('yes')
  })

  it('ignores screens without the prompt', () => {
    expect(trustPrompt('hello\r\n> ')).toBeNull()
  })


})

describe('answering the trust prompt reliably', () => {
  const fakeTerminal = (dropFirst: number) => {
    let dropped = 0
    let highlighted: 'yes' | 'no' = 'no'
    let answered = false
    const writes: string[] = []
    return {
      writes,
      screen: () => (answered ? 'Welcome back! Tips for getting started' : screen(highlighted === 'yes')),
      write: (keys: string) => {
        writes.push(keys)
        if (dropped < dropFirst) return void dropped++
        if (keys === '\x1b[B') highlighted = 'yes'
        else if (keys === '\x1b[A') highlighted = 'no'
        else if (keys === '\r') answered = true
      }
    }
  }
  const sleep = async () => {}

  it('moves the cursor, pauses, then confirms', async () => {
    const t = fakeTerminal(0)
    expect(await answerTrust({ screen: t.screen, write: t.write, sleep }, true)).toBe(true)
    expect(t.writes).toEqual(['\x1b[B', '\r'])
  })

  it('tries again when the keys were swallowed before Claude was listening', async () => {
    const t = fakeTerminal(2)
    expect(await answerTrust({ screen: t.screen, write: t.write, sleep }, true)).toBe(true)
    expect(t.writes.length).toBeGreaterThan(2)
  })

  it('gives up after a few attempts rather than typing forever', async () => {
    const t = fakeTerminal(99)
    expect(await answerTrust({ screen: t.screen, write: t.write, sleep }, true)).toBe(false)
    expect(t.writes.length).toBeLessThanOrEqual(6)
  })
})
