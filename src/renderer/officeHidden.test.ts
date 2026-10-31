import { describe, expect, it } from 'vitest'
import { officeHidden } from './officeHidden'

describe('whether the office is out of the window', () => {
  it('is hidden when the person hid it and there is an agent to talk to', () => {
    expect(officeHidden(true, 2, false)).toBe(true)
  })

  it('shows it when it was not hidden', () => {
    expect(officeHidden(false, 2, false)).toBe(false)
  })

  it('shows it with no agent, since the panel would have nothing in it and the office is where one is hired', () => {
    expect(officeHidden(true, 0, false)).toBe(false)
  })

  it('shows it while the grid takes its place, which has its own layout', () => {
    expect(officeHidden(true, 2, true)).toBe(false)
  })
})
