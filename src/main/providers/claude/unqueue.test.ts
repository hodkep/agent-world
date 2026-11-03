import { describe, expect, it } from 'vitest'
import { claudeKeys } from './keys'

const RULE = '─'.repeat(100)
// Claude's screen as it was captured: history, the queued messages, then the input between two rules.
const screen = (input: string, above = ['❯ Run the long task', '❯ queued one', '❯ queued two']) => [...above, '', RULE, `❯ ${input}`, RULE, '  ⏵⏵ auto mode on'].join('\n')
const step = (s: string, started = false) => claudeKeys.unqueueStep!(s, started)

describe('taking back what waits in Claude\'s queue, one key at a time from what the screen shows', () => {
  it('presses Up when Claude offers to select a queued message, and when it offers to edit them all', () => {
    expect(step(screen('Press up to select a queued message to edit, or Enter to send them now'))).toBe(claudeKeys.editQueued)
    expect(step(screen('Press up to select a queued message, then Enter to edit it'))).toBe(claudeKeys.editQueued)
    expect(step(screen('Press up to edit queued messages, Enter to send them immediately'))).toBe(claudeKeys.editQueued)
  })
  it('is not put off by the earlier messages that Claude lists above the input with the same prompt mark', () => {
    expect(step(screen('Press up to edit queued messages', ['❯ typed in the past', '❯ queued one']))).toBe(claudeKeys.editQueued)
  })
  it('reads the hints only from the input box, so words an agent printed above it cannot press keys', () => {
    const history = ['❯ some task', 'Press up to edit queued messages', 'Press Enter to edit the selected message, or up again for history']
    expect(step(screen('', history))).toBeNull()
    expect(step(screen('', history), true)).toBeNull()
  })
  it('presses Enter, to edit it, when a queued message is selected, and never when Enter would send the queue', () => {
    expect(step(screen('Press Enter to edit the selected message, or up again for history'))).toBe('\r')
    expect(step(screen('Press Enter to edit the selected message, or up again for an older one'))).toBe('\r')
    expect(step(screen('Press up to select a queued message to edit, or Enter to send them now'))).not.toBe('\r')
  })
  it('empties the input when a take-back has put a message in it', () => {
    expect(step(screen('queued one'), true)).toBe(claudeKeys.clearInput)
    expect(step(screen('queued one queued two'), true)).toBe(claudeKeys.clearInput)
  })
  it('leaves words the person was typing alone', () => {
    expect(step(screen('my own draft'), false)).toBeNull()
  })
  it('stops when nothing waits any more', () => {
    expect(step(screen(''), true)).toBeNull()
    expect(step('', false)).toBeNull()
  })
})
