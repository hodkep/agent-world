import { describe, expect, it } from 'vitest'
import { chosenAccount } from './accounts'

const mine = [{ id: 'w1' }, { id: 'r1' }]

describe('chosenAccount', () => {
  it('starts on the account set as the default for the program', () => {
    expect(chosenAccount(mine, null, 'w1')).toBe('w1')
  })
  it('starts on the own login when no default is set', () => {
    expect(chosenAccount(mine, null, undefined)).toBe('')
  })
  it('keeps a picked added account', () => {
    expect(chosenAccount(mine, 'r1', 'w1')).toBe('r1')
  })
  it("keeps the program's own login when picked, even with another set as the default", () => {
    expect(chosenAccount(mine, '', 'w1')).toBe('')
  })
  it('falls back to the default when the picked account is gone', () => {
    expect(chosenAccount(mine, 'gone', 'w1')).toBe('w1')
  })
})
