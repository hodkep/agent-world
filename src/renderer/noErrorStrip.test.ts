import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

// Errors reach the person as toasts, on top of the whole window; a strip beside the toolbar takes room and is easy to miss.
it('App shows its errors as toasts, not in a strip', () => {
  const src = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8')
  expect(src).not.toMatch(/setError\(/)
  expect(src).not.toContain('className="error"')
})
