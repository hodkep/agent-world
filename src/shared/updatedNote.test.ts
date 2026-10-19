import { describe, expect, it } from 'vitest'
import { justUpdated } from './updatedNote'

describe('when the app says it was updated', () => {
  it('only when a version was seen before and the running one is different', () => {
    expect(justUpdated('0.2.0', '0.2.1')).toBe(true)
    expect(justUpdated('0.2.1', '0.2.1')).toBe(false)
  })
  it('never on the first start with nothing seen before, and not after going back to an older build', () => {
    expect(justUpdated('', '0.2.0')).toBe(false)
    expect(justUpdated('0.3.0', '0.2.0')).toBe(false)
  })
  it('is false for a version it cannot read', () => {
    expect(justUpdated('0.2.0', 'dev')).toBe(false)
    expect(justUpdated('dev', '0.2.0')).toBe(false)
  })
})
