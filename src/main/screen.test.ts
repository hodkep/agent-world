import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { providerOf } from './providers/registry'

const { trustPrompt, inputReady } = providerOf({}).screen
import { Screen } from './screen'

// One real Claude Code 2.1.284 session, captured from launch: at the trust menu, after an arrow key, after Enter.
// Each file is the whole stream up to that point, so absolute cursor moves replay exactly.
const fixture = (name: string) => readFileSync(join(__dirname, 'providers', 'claude', 'fixtures', name), 'utf8')

describe('headless screen', () => {
  it('renders what the user would see, cursor moves and all', async () => {
    const s = new Screen(100, 30)
    await s.write(fixture('session-prompt.ansi'))
    expect(s.text()).toContain('Yes, I trust this folder')
    expect(trustPrompt(s.text())?.highlighted).toBe('no')
  })

  it('follows a partial redraw: the arrow key moves the highlight to Yes', async () => {
    const s = new Screen(100, 30)
    await s.write(fixture('session-move.ansi'))
    expect(trustPrompt(s.text())?.highlighted).toBe('yes')
  })

  it('the menu is gone once Claude accepts the answer', async () => {
    const s = new Screen(100, 30)
    await s.write(fixture('session-confirm.ansi'))
    expect(trustPrompt(s.text())).toBeNull()
  })

  it('is not ready while the trust menu is up', async () => {
    const s = new Screen(100, 30)
    await s.write(fixture('session-prompt.ansi'))
    expect(inputReady(s.text())).toBe(false)
  })

  it('is ready once the input box is on screen (text as rendered in the real terminal)', () => {
    // Copied from the in-app terminal during a real Claude Code 2.1.284 run.
    const rendered = [
      ' ▐▛███▛█   Claude Code v2.1.284',
      '─────────────────────────────────────────────────────────── linus ─',
      '❯ Try "how does <filepath> work?"',
      '───────────────────────────────────────────────────────────────────',
      '  Est. usage: $0.00',
      '  ⏵⏵ auto mode on (shift+tab to cycle) · ← 2 agents'
    ].join('\n')
    expect(inputReady(rendered)).toBe(true)
  })
})
