import { describe, expect, it } from 'vitest'
import { createCertGate } from './previewCerts'

const USE_CHROMIUM = -3
const ACCEPT = 0

describe('the Preview certificate gate', () => {
  it('leaves a good certificate and a bad one to Chromium until the person allows that site', () => {
    const g = createCertGate()
    expect(g.check('shop.test', 'net::OK')).toBe(USE_CHROMIUM)
    expect(g.check('old.test', 'net::ERR_CERT_DATE_INVALID')).toBe(USE_CHROMIUM)
  })

  it('accepts a site once it failed and the person allowed it, and only that host', () => {
    const g = createCertGate()
    g.check('old.test', 'net::ERR_CERT_DATE_INVALID')
    expect(g.allow('old.test')).toBe(true)
    expect(g.check('old.test', 'net::ERR_CERT_DATE_INVALID')).toBe(ACCEPT)
    expect(g.check('www.old.test', 'net::ERR_CERT_DATE_INVALID')).toBe(USE_CHROMIUM)
    expect(g.check('other.test', 'net::ERR_CERT_AUTHORITY_INVALID')).toBe(USE_CHROMIUM)
  })

  it('refuses to allow a host that never failed a check, so a page or an agent cannot pre-allow one', () => {
    const g = createCertGate()
    expect(g.allow('never.test')).toBe(false)
    g.check('good.test', 'net::OK')
    expect(g.allow('good.test')).toBe(false)
    expect(g.check('never.test', 'net::ERR_CERT_COMMON_NAME_INVALID')).toBe(USE_CHROMIUM)
  })

  it('compares host names without regard to case', () => {
    const g = createCertGate()
    g.check('Old.Test', 'net::ERR_CERT_DATE_INVALID')
    expect(g.allow('old.TEST')).toBe(true)
    expect(g.check('OLD.test', 'net::ERR_CERT_DATE_INVALID')).toBe(ACCEPT)
  })

  it('lists the hosts that were allowed, lower case, and nothing else', () => {
    const g = createCertGate()
    expect(g.allowed()).toEqual([])
    g.check('Old.Test', 'net::ERR_CERT_DATE_INVALID')
    g.check('seen.test', 'net::ERR_CERT_DATE_INVALID')
    g.allow('old.test')
    expect(g.allowed()).toEqual(['old.test'])
  })
})
