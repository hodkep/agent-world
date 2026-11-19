import { describe, expect, it } from 'vitest'
import { readTheme, saveTheme } from './theme'

const store = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}
const blocked = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }

describe("the viewer's look", () => {
  it('starts on paper', () => {
    expect(readTheme(store())).toBe('paper')
  })
  it('remembers dark once chosen, and paper again after', () => {
    const s = store()
    saveTheme('dark', s)
    expect(readTheme(s)).toBe('dark')
    saveTheme('paper', s)
    expect(readTheme(s)).toBe('paper')
  })
  it('ignores a value it does not know', () => {
    const s = store()
    s.setItem('aw.officeTheme', 'neon')
    expect(readTheme(s)).toBe('paper')
  })
  it('falls back to paper and does not throw when storage is blocked', () => {
    expect(readTheme(blocked)).toBe('paper')
    expect(() => saveTheme('dark', blocked)).not.toThrow()
  })
})
