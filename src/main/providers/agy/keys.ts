import type { Keys } from '../ports'

export const agyKeys: Keys = {
  paste: (text) => `\x1b[200~${text}\x1b[201~`,
  submit: '\r',
  submitDelayMs: 150,
  // Ctrl+U clears one line of the input; a pasted message of several lines needs it once per line.
  clearInput: '\x15',
  editQueued: '',
  cancel: '\x1b',
  nextMode: '\x1b[Z',
  // Esc stops a turn ("Interrupted") and refuses an open question; Ctrl+C twice would leave agy altogether, so it is not used.
  interrupt: { first: '\x1b', then: [[1200, '\x1b']] }
}
