import type { Keys } from '../ports'

export const claudeKeys: Keys = {
  paste: (text) => `\x1b[200~${text}\x1b[201~`,
  submit: '\r',
  submitDelayMs: 150,
  clearInput: '\x15',
  cancel: '\x1b',
  nextMode: '\x1b[Z',
  // Esc is how Claude's terminal interrupts a turn; it can swallow a first one, so repeat, and end with Ctrl+C.
  interrupt: { first: '\x1b', then: [[1200, '\x1b'], [2400, '\x1b'], [3600, '\x03']] }
}
