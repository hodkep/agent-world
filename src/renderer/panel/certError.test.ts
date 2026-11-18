import { describe, expect, it } from 'vitest'
import { insecureHost, isCertError } from './certError'

describe('isCertError', () => {
  it('is true for Chromium certificate errors (-200 to -219) and nothing else', () => {
    for (const c of [-200, -201, -202, -207, -219]) expect(isCertError(c)).toBe(true)
    for (const c of [-3, -6, -105, -199, -220, 0, undefined]) expect(isCertError(c)).toBe(false)
  })
})

describe('insecureHost', () => {
  it('is the host of an https page whose certificate the person chose to go past, else empty', () => {
    expect(insecureHost('https://Old.Test:8443/a?b=1', ['old.test'])).toBe('old.test')
    expect(insecureHost('https://other.test/', ['old.test'])).toBe('')
    expect(insecureHost('https://www.old.test/', ['old.test'])).toBe('')
    expect(insecureHost('http://old.test/', ['old.test'])).toBe('')
    expect(insecureHost('not a url', ['old.test'])).toBe('')
    expect(insecureHost('https://old.test/', [])).toBe('')
  })
})
