import { describe, expect, it } from 'vitest'
import { cleanName, checkName } from './names'

describe('agent names', () => {
  it('lowercases and strips everything but letters, digits and dashes', () => {
    expect(cleanName('  Ada Lovelace! ')).toBe('adalovelace')
    expect(cleanName('a'.repeat(30))).toHaveLength(20)
  })

  it('rejects empty names and names another agent has', () => {
    const others = ['ada', 'linus']
    expect(() => checkName('', others)).toThrow(/name/i)
    expect(() => checkName('Ada', others)).toThrow(/already/i)
    expect(checkName('grace', others)).toBe('grace')
  })
})
