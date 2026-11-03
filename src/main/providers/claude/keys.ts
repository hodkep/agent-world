import type { Keys } from '../ports'

/** What is in Claude's input box: the lines between the last two rules, without the prompt mark. It holds what is typed, or Claude's own hint ("Press up to…") when nothing is. */
function inputBox(screen: string): string {
  const rows = screen.split('\n')
  const rules = rows.flatMap((l, k) => (l.startsWith('────') ? [k] : []))
  if (rules.length < 2) return ''
  return rows
    .slice(rules.at(-2)! + 1, rules.at(-1))
    .map((l) => l.replace(/^\s*❯[\s\u00a0]*/, '').trim())
    .filter(Boolean)
    .join(' ')
}

export const claudeKeys: Keys = {
  paste: (text) => `\x1b[200~${text}\x1b[201~`,
  submit: '\r',
  submitDelayMs: 150,
  clearInput: '\x15',
  // Up, with nothing typed, takes the queued messages back into the input box.
  editQueued: '\x1b[A',
  // Up selects a queued message (older versions pull them all into the input) and Enter then edits the selected one; read from what the screen offers.
  // `started` is whether this take-back already pressed a key: words already in the input before that are the person's own, and are left alone.
  unqueueStep: (screen, started) => {
    // Only the input box is read: words an agent printed higher up the screen must not press keys.
    const box = inputBox(screen)
    if (/^Press Enter to edit the selected message/i.test(box)) return '\r'
    if (/^Press up to (select a queued message|edit queued messages)/i.test(box)) return '\x1b[A'
    if (box) return started ? '\x15' : null
    return null
  },
  cancel: '\x1b',
  nextMode: '\x1b[Z',
  // Esc is how Claude's terminal interrupts a turn; it can swallow a first one, so repeat, and end with Ctrl+C.
  interrupt: { first: '\x1b', then: [[1200, '\x1b'], [2400, '\x1b'], [3600, '\x03']] }
}
