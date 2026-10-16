import { afterEach, describe, expect, it, vi } from 'vitest'
import { followLink, isWebUrl, linkHint, webAddress } from './links'

describe('an address typed into the Preview bar', () => {
  it('takes a bare port, host and port, or a full address on this machine as plain http', () => {
    expect(webAddress('5287')).toBe('http://localhost:5287/')
    expect(webAddress('5287/shop?x=1')).toBe('http://localhost:5287/shop?x=1')
    expect(webAddress('localhost:5287')).toBe('http://localhost:5287/')
    expect(webAddress('127.0.0.1:3000/app?x=1')).toBe('http://127.0.0.1:3000/app?x=1')
    expect(webAddress(' http://localhost:8080/docs ')).toBe('http://localhost:8080/docs')
  })

  it('takes a page on the internet: a full address as it is, a bare name as https', () => {
    expect(webAddress('https://docs.anthropic.com/en/home')).toBe('https://docs.anthropic.com/en/home')
    expect(webAddress('http://example.com')).toBe('http://example.com/')
    expect(webAddress('example.com')).toBe('https://example.com/')
    expect(webAddress('docs.example.co.uk/a/b?x=1#top')).toBe('https://docs.example.co.uk/a/b?x=1#top')
    expect(webAddress('https://localhost:5287')).toBe('https://localhost:5287/')
  })

  it('takes a machine on the local network by its number, as plain http', () => {
    expect(webAddress('192.168.1.20:3000/app')).toBe('http://192.168.1.20:3000/app')
  })

  it('refuses what is not an address a page can be shown at', () => {
    expect(webAddress('')).toBeNull()
    expect(webAddress('hello')).toBeNull()
    expect(webAddress('99999')).toBeNull()
    expect(webAddress('two words.com')).toBeNull()
    expect(webAddress('javascript:alert(1)')).toBeNull()
    expect(webAddress('ftp://example.com/a')).toBeNull()
    expect(webAddress('file:///etc/passwd')).toBeNull()
    expect(webAddress('https://')).toBeNull()
  })
})

describe('which addresses are pages', () => {
  it('counts any http or https address, and nothing else', () => {
    expect(isWebUrl('https://example.com/a')).toBe(true)
    expect(isWebUrl('http://localhost:3000')).toBe(true)
    expect(isWebUrl('mailto:a@b.c')).toBe(false)
    expect(isWebUrl('file:///a.html')).toBe(false)
    expect(isWebUrl('not a url')).toBe(false)
  })
})

describe('a click on a link in the chat', () => {
  afterEach(() => vi.unstubAllGlobals())
  const stub = () => {
    const events: { type: string; detail: unknown }[] = []
    const openExternal = vi.fn(() => Promise.resolve())
    vi.stubGlobal('window', { aw: { openExternal }, dispatchEvent: (e: { type: string; detail: unknown }) => events.push(e) })
    vi.stubGlobal('CustomEvent', class { constructor(public type: string, init: { detail: unknown }) { this.detail = init.detail } detail: unknown })
    return { events, openExternal }
  }
  it('opens any page in the Preview, and ⌘ or Ctrl opens the browser instead', () => {
    const s = stub()
    followLink('https://example.com/x', { metaKey: false, ctrlKey: false }, 'a1')
    expect(s.events).toHaveLength(1)
    expect(s.events[0]).toMatchObject({ type: 'aw-preview', detail: { agentId: 'a1', url: 'https://example.com/x' } })
    expect(s.openExternal).not.toHaveBeenCalled()
    followLink('https://example.com/x', { metaKey: true, ctrlKey: false }, 'a1')
    followLink('http://localhost:3000', { metaKey: false, ctrlKey: true }, 'a1')
    expect(s.openExternal).toHaveBeenCalledTimes(2)
    expect(s.events).toHaveLength(1)
  })
  it('goes to the browser when there is no agent whose Preview it could be', () => {
    const s = stub()
    followLink('https://example.com/x', { metaKey: false, ctrlKey: false })
    expect(s.openExternal).toHaveBeenCalledTimes(1)
    expect(s.events).toHaveLength(0)
  })
  it('says the same for every page', () => {
    expect(linkHint('https://example.com')).toBe(linkHint('http://localhost:3000'))
    expect(linkHint('https://example.com')).toMatch(/Preview/)
  })
})
