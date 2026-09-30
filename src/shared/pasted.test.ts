import { describe, expect, it } from 'vitest'
import { unwrapPasted } from './pasted'

describe('unwrapPasted', () => {
  it('drops the wrapper lines and keeps the text between', () => {
    expect(unwrapPasted('<pasted_content id="cc20">\nline one\nline two\n</pasted_content id="cc20">')).toBe('line one\nline two\n')
  })
  it('leaves ordinary text, and mentions of the word, alone', () => {
    expect(unwrapPasted('hello')).toBe('hello')
    expect(unwrapPasted('what is pasted_content?')).toBe('what is pasted_content?')
  })
  it('cleans a wrapper in the middle of a message', () => {
    expect(unwrapPasted('see:\n<pasted_content id="a">\nx\n</pasted_content id="a">\nthanks')).toBe('see:\nx\nthanks')
  })
})
