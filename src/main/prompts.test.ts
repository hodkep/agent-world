import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { answerMenu, answerTrust, planMenu, trustPrompt } from './prompts'

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

// Rendered text of Claude Code 2.1.284's plan approval menu, copied from the in-app terminal.
const PLAN_MENU = readFileSync(join(__dirname, 'fixtures', 'plan-menu.txt'), 'utf8')

describe('plan approval menu', () => {
  it('is detected with its highlighted option', () => {
    expect(planMenu(PLAN_MENU)).toEqual({ highlighted: 0 })
    expect(planMenu(PLAN_MENU.replace('❯ 1. Yes, auto-accept', '  1. Yes, auto-accept').replace('  2. Yes, manually', '❯ 2. Yes, manually'))).toEqual({ highlighted: 1 })
  })

  it('is not confused with the trust menu or a normal screen', () => {
    expect(planMenu(screen(false))).toBeNull()
    expect(planMenu('❯ Try "fix lint errors"')).toBeNull()
  })

  it('answers by moving one option at a time and confirming only on the right one', async () => {
    let at = 0
    const writes: string[] = []
    let answered = false
    const labels = ['1. Yes, auto-accept', '2. Yes, manually', '3. Tell Claude']
    const render = () => (answered ? 'done' : PLAN_MENU.replace('❯ 1. Yes, auto-accept', '  1. Yes, auto-accept').replace(`  ${labels[at]}`, `❯ ${labels[at]}`))
    const io = {
      screen: render,
      write: (k: string) => {
        writes.push(k)
        if (k === '\x1b[B') at = Math.min(2, at + 1)
        else if (k === '\x1b[A') at = Math.max(0, at - 1)
        else if (k === '\r') answered = true
      },
      sleep: async () => {}
    }
    expect(await answerMenu(io, planMenu, 2)).toBe(true)
    expect(writes).toEqual(['\x1b[B', '\x1b[B', '\r'])
  })
})
