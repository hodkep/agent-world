import { describe, expect, it } from 'vitest'
import { allowSite, forgetSite, hostOf, loadSites, needsAsking } from './previewSites'

const store = (initial?: string) => {
  const data = new Map<string, string>(initial === undefined ? [] : [['aw.preview.sites', initial]])
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }
}

describe('the sites the Preview was told it may show', () => {
  it('asks about a site on the internet until it is allowed, never about this computer, and by host', () => {
    expect(needsAsking('https://example.com/a', [])).toBe(true)
    expect(needsAsking('https://example.com/a', ['example.com'])).toBe(false)
    expect(needsAsking('https://example.com:8443/b', ['example.com'])).toBe(true)
    expect(needsAsking('http://localhost:3000/', [])).toBe(false)
    expect(needsAsking('http://127.0.0.1:3000/', [])).toBe(false)
    expect(needsAsking('https://sub.example.com/', ['example.com'])).toBe(true)
  })
  it('names the host with its port, as the address does', () => {
    expect(hostOf('https://Example.com/a?b')).toBe('example.com')
    expect(hostOf('http://192.168.1.20:3000/x')).toBe('192.168.1.20:3000')
    expect(hostOf('nonsense')).toBe('')
  })
  it('keeps what was allowed, once for each host, and forgets one host without touching the others', () => {
    const s = store()
    expect(allowSite(s, 'a.com')).toEqual(['a.com'])
    expect(allowSite(s, 'b.com')).toEqual(['a.com', 'b.com'])
    expect(allowSite(s, 'a.com')).toEqual(['a.com', 'b.com'])
    expect(loadSites(s)).toEqual(['a.com', 'b.com'])
    expect(forgetSite(s, 'a.com')).toEqual(['b.com'])
    expect(loadSites(s)).toEqual(['b.com'])
  })
  it('starts empty when what was kept is missing or damaged', () => {
    expect(loadSites(store())).toEqual([])
    expect(loadSites(store('{nope'))).toEqual([])
    expect(loadSites(store('{"a":1}'))).toEqual([])
    expect(loadSites(store('["a.com", 3, null]'))).toEqual(['a.com'])
  })
  it('works when the browser keeps nothing', () => {
    const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(loadSites(broken)).toEqual([])
    expect(allowSite(broken, 'a.com')).toEqual(['a.com'])
  })
})
