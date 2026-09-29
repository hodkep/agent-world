import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { trustAnswerKeys, trustPrompt } from './prompts'

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

// Bytes captured from a real Claude Code 2.1.280 PTY: words are placed with cursor moves, not spaces.
const REAL = readFileSync(join(__dirname, 'fixtures', 'trust-prompt.ansi'), 'utf8')

describe('workspace trust prompt', () => {
  it('detects the menu in real Claude output', () => {
    expect(trustPrompt(REAL)).toEqual({ path: '/Users/me/.agent-world/worktrees-Z/shop-api-1234/ada', highlighted: 'no' })
  })

  it('detects the prompt and which option is highlighted', () => {
    expect(trustPrompt(screen(false))).toEqual({ path: '/Users/me/.agent-world/worktrees/shop-api-1234/ada', highlighted: 'no' })
    expect(trustPrompt(screen(true))?.highlighted).toBe('yes')
  })

  it('ignores output without the prompt, or where it was already answered', () => {
    expect(trustPrompt('hello\r\n> ')).toBeNull()
    expect(trustPrompt(`${screen(false)}\r\n\x1b[2J Welcome back! Tips for getting started`)).toBeNull()
  })

  it('presses exactly what is needed to land on the chosen option', () => {
    expect(trustAnswerKeys('no', true)).toBe('\x1b[B\r')
    expect(trustAnswerKeys('yes', true)).toBe('\r')
    expect(trustAnswerKeys('yes', false)).toBe('\x1b[A\r')
    expect(trustAnswerKeys('no', false)).toBe('\r')
  })
})
