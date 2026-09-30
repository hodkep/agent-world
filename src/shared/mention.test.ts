import { describe, expect, it } from 'vitest'
import { mentionText } from './mention'

describe('dropped files become @-mentions', () => {
  it('quotes each path so spaces survive, one trailing space after each', () => {
    expect(mentionText(['/a/b.ts', '/my docs/c d.md'])).toBe('@"/a/b.ts" @"/my docs/c d.md" ')
  })

  it('drops control characters and quotes that could end the mention or press keys', () => {
    expect(mentionText(['/a/"x"\r\n\x1b[201~y'])).toBe('@"/a/x[201~y" ')
  })

  it('ignores empty paths', () => {
    expect(mentionText(['', '  '])).toBe('')
  })
})
