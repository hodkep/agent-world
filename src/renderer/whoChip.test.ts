import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('the writer chip of an Agent Memory note', () => {
  // A bare .who rule is also the agent's name above a reply and the account block: it once turned both into a yellow square.
  it('is styled inside .memory only', () => {
    const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')
    expect(css).not.toMatch(/^\.who\s*\{/m)
    expect(css).toMatch(/^\.memory \.who\s*\{/m)
  })
})
