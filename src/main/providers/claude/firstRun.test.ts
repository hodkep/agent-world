import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { firstRunScreen } from './firstRun'
import { anyMenu, inputReady } from './prompts'
import { genericMenu } from './menus'

// The screens as Claude Code 2.1.302 drew them in a terminal with a config folder that had never been used.
const fx = (name: string) => readFileSync(join(__dirname, 'fixtures', `onboarding-${name}.txt`), 'utf8')

describe('the first questions a new Claude Code asks', () => {
  it('reads the text style list, which has no numbers: its choices, and the one the cursor is on', () => {
    const s = firstRunScreen(fx('theme'))!
    expect(s.kind).toBe('theme')
    expect(s.title).toBe('Choose the text style that looks best with your terminal')
    expect(s.options).toEqual(['Auto (match terminal)', 'Dark mode', 'Light mode', 'Dark mode (colorblind-friendly)', 'Light mode (colorblind-friendly)', 'Dark mode (ANSI colors only)', 'Light mode (ANSI colors only)'])
    expect(s.highlighted).toBe(1)
    expect(s.cancellable).toBe(false)
    expect(s.terminalOnly).toBe(false)
  })

  it('reads the question about an API key found in the environment, with its two answers', () => {
    const s = firstRunScreen(fx('apikey'))!
    expect(s.kind).toBe('apikey')
    expect(s.title).toBe('Detected a custom API key in your environment')
    expect(s.context).toContain('ANTHROPIC_API_KEY: sk-ant-...')
    expect(s.options).toEqual(['Yes', 'No (recommended)'])
    expect(s.highlighted).toBe(1)
    expect(s.cancellable).toBe(true)
    expect(firstRunScreen(fx('apikey').replace('  ❯ No (recommended)', '    No (recommended)').replace('    Yes', '  ❯ Yes'))!.highlighted).toBe(0)
  })

  it('reads the choice of how to log in, which Esc does nothing on, with the sentence above it', () => {
    const s = firstRunScreen(fx('login'))!
    expect(s.kind).toBe('login')
    expect(s.title).toBe('Select login method')
    expect(s.context).toContain('Claude Code can be used with your Claude subscription')
    expect(s.options).toHaveLength(3)
    expect(s.options[0]).toBe('Claude account with subscription · Pro, Max, Team, or Enterprise')
    expect(s.highlighted).toBe(0)
    expect(s.cancellable).toBe(false)
  })

  it('knows the page that waits for a code from the browser needs the terminal, and says what to do there without its long address', () => {
    const s = firstRunScreen(fx('oauth'))!
    expect(s.kind).toBe('oauth')
    expect(s.terminalOnly).toBe(true)
    expect(s.options).toEqual([])
    expect(s.title).toBe('Sign in to Claude Code')
    expect(s.context).toMatch(/browser/i)
    expect(s.context).not.toContain('https://')
  })

  it('reads the security notes, which only continue', () => {
    const s = firstRunScreen(fx('security'))!
    expect(s.kind).toBe('security')
    expect(s.title).toBe('Security notes')
    expect(s.context).toContain('Claude can make mistakes')
    expect(s.options).toEqual(['Continue (Enter)'])
    expect(s.cancellable).toBe(false)
  })

  it('leaves the trust question to its own card, and says nothing for an ordinary screen', () => {
    expect(firstRunScreen(fx('trust'))).toBeNull()
    expect(firstRunScreen('Claude Code\n──────\n❯ hello\n──────')).toBeNull()
    expect(firstRunScreen('')).toBeNull()
  })

  it('is not fooled by the same words in a conversation: Claude draws its input box under them', () => {
    const talk = `${fx('security')}\n\n──────────────────────────────────────────────────────────────\n❯ \n──────────────────────────────────────────────────────────────\n  ? for shortcuts`
    expect(firstRunScreen(talk)).toBeNull()
    expect(anyMenu(talk)).toBe(false)
  })

  it('counts as a menu that is open, so nothing typed in the chat can answer it, and is never an input box ready for a message', () => {
    for (const n of ['theme', 'apikey', 'login', 'oauth', 'security']) {
      expect(anyMenu(fx(n)), n).toBe(true)
      expect(inputReady(fx(n)), n).toBe(false)
    }
  })

  it('is what the chat is offered for these screens, with the name of the choice and whether Esc works', () => {
    const m = genericMenu(fx('login'))!
    expect(m).toMatchObject({ title: 'Select login method', highlighted: 0, cancellable: false })
    expect(m.options).toHaveLength(3)
    expect(genericMenu(fx('theme'))).toMatchObject({ title: 'Choose the text style that looks best with your terminal', highlighted: 1, cancellable: false })
    expect(genericMenu(fx('oauth'))).toMatchObject({ terminalOnly: true, options: [] })
    expect(genericMenu(fx('apikey'))).toMatchObject({ cancellable: true })
  })
})
