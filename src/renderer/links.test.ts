import { describe, expect, it } from 'vitest'
import { localAddress } from './links'

describe('an address typed into the Preview bar', () => {
  it('takes a bare port, host and port, or a full address', () => {
    expect(localAddress('5287')).toBe('http://localhost:5287/')
    expect(localAddress('5287/shop?x=1')).toBe('http://localhost:5287/shop?x=1')
    expect(localAddress('localhost:5287')).toBe('http://localhost:5287/')
    expect(localAddress('127.0.0.1:3000/app?x=1')).toBe('http://127.0.0.1:3000/app?x=1')
    expect(localAddress(' http://localhost:8080/docs ')).toBe('http://localhost:8080/docs')
  })

  it('refuses anything that is not a plain-http address on this machine', () => {
    expect(localAddress('')).toBeNull()
    expect(localAddress('https://localhost:5287')).toBeNull()
    expect(localAddress('http://example.com')).toBeNull()
    expect(localAddress('example.com:80')).toBeNull()
    expect(localAddress('99999')).toBeNull()
    expect(localAddress('hello')).toBeNull()
  })
})
