import { describe, expect, it } from 'vitest'
import { commandLine } from './commands'

describe('typing a command', () => {
  it('becomes one line, with arguments stripped of control characters', () => {
    expect(commandLine('compact', '')).toBe('/compact')
    expect(commandLine('db:migrate', 'staging\r/exit\x1b[201~')).toBe('/db:migrate staging /exit')
  })

  it('refuses names that are not plain command names', () => {
    expect(() => commandLine('../evil', '')).toThrow()
    expect(() => commandLine('a b', '')).toThrow()
  })
})
