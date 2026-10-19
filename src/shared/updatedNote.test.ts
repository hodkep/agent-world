import { describe, expect, it } from 'vitest'
import { justUpdated, learnsVersion } from './updatedNote'

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

describe('when the app just learns the version it runs, without saying anything', () => {
  it('on the first start (nothing seen), and after going back to an older build, so the next upgrade is announced again', () => {
    expect(learnsVersion('', '0.2.0')).toBe(true)
    expect(learnsVersion('0.3.0', '0.2.0')).toBe(true)
  })
  it('not when it is the same version, when it was updated (that is announced, then remembered), or when a version cannot be read', () => {
    expect(learnsVersion('0.2.0', '0.2.0')).toBe(false)
    expect(learnsVersion('0.2.0', '0.3.0')).toBe(false)
    expect(learnsVersion('dev', '0.2.0')).toBe(false)
    expect(learnsVersion('0.2.0', 'dev')).toBe(false)
  })
})
