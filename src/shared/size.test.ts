import { describe, expect, it } from 'vitest'
import { sizeText } from './size'

describe('a size as people read it', () => {
  it('writes a size the way people read it', () => {
    expect(sizeText(12)).toBe('12 B')
    expect(sizeText(12 * 1024)).toBe('12 KB')
    expect(sizeText(4.8 * 1024 * 1024)).toBe('4.8 MB')
    expect(sizeText(5.6 * 1024 ** 3)).toBe('5.6 GB')
    expect(sizeText(220 * 1024)).toBe('220 KB')
  })
})
