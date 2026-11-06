import { describe, expect, it } from 'vitest'
import { decide } from './policy'

const page = { url: 'https://app.example.com/inbox' }

describe('what a tool may ask of the page it is on', () => {
  it.each(['Runtime.evaluate', 'DOM.getDocument', 'Page.captureScreenshot', 'Accessibility.getFullAXTree', 'Network.enable', 'Input.dispatchMouseEvent'])('passes %s on unchanged', (m) => {
    const p = { a: 1 }
    expect(decide(m, p, page)).toEqual({ do: 'forward', params: p })
  })

  it.each(['Browser.close', 'Browser.setPermission', 'Storage.clearCookies', 'Storage.getCookies', 'Target.createTarget', 'SystemInfo.getInfo', 'IO.read', 'Security.disable'])('refuses %s, saying why', (m) => {
    const d = decide(m, {}, page)
    expect(d.do).toBe('refuse')
    expect((d as { why: string }).why).toMatch(/not available|not allowed|not a/i)
  })

  it.each(['Page.close', 'Page.crash', 'Page.setInterceptFileChooserDialog', 'DOM.setFileInputFiles', 'Network.getAllCookies', 'Network.clearBrowserCookies', 'Network.clearBrowserCache', 'Network.loadNetworkResource'])('refuses %s even though its area is open', (m) => {
    expect(decide(m, {}, page).do).toBe('refuse')
  })

  it('answers the download setting itself: downloads stay off whatever the tool asks', () => {
    expect(decide('Page.setDownloadBehavior', { behavior: 'allow' }, page)).toEqual({ do: 'reply', result: {} })
  })

  it('answers a size command itself: the Preview’s frame takes that size, which is what the page then really has', () => {
    expect(decide('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true }, page)).toEqual({ do: 'reply', result: {} })
    expect(decide('Emulation.clearDeviceMetricsOverride', {}, page)).toEqual({ do: 'reply', result: {} })
    expect(decide('Emulation.setUserAgentOverride', { userAgent: 'x' }, page).do).toBe('forward')
  })

  it('refuses dragging files into the page, and lets other dragging through', () => {
    expect(decide('Input.dispatchDragEvent', { type: 'drop', x: 1, y: 1, data: { items: [], files: ['/etc/passwd'] } }, page).do).toBe('refuse')
    expect(decide('Input.dispatchDragEvent', { type: 'dragOver', x: 1, y: 1, data: { items: [] } }, page).do).toBe('forward')
  })
})

describe('moving the page', () => {
  it('hands the address to be checked before anything is sent', () => {
    expect(decide('Page.navigate', { url: 'https://example.com/x' }, page)).toEqual({ do: 'navigate', url: 'https://example.com/x', params: { url: 'https://example.com/x' } })
  })
  it('refuses a move with no address', () => {
    expect(decide('Page.navigate', {}, page).do).toBe('refuse')
  })
})

describe('cookies', () => {
  it('reads those of the page being shown only: a list of other addresses is dropped', () => {
    expect(decide('Network.getCookies', { urls: ['https://bank.example.org/'] }, page)).toEqual({ do: 'forward', params: {} })
  })

  it('sets a cookie on the page’s own site or a parent domain of it, and fills in the page when none is named', () => {
    expect(decide('Network.setCookie', { name: 'a', value: '1' }, page)).toEqual({ do: 'forward', params: { name: 'a', value: '1', url: page.url } })
    expect(decide('Network.setCookie', { name: 'a', value: '1', domain: '.example.com' }, page).do).toBe('forward')
    expect(decide('Network.setCookie', { name: 'a', value: '1', url: 'https://app.example.com/' }, page).do).toBe('forward')
  })

  it('refuses a cookie for any other site, and for one that merely ends the same way', () => {
    expect(decide('Network.setCookie', { name: 'a', value: '1', domain: 'bank.example.org' }, page).do).toBe('refuse')
    expect(decide('Network.setCookie', { name: 'a', value: '1', domain: 'notexample.com' }, page).do).toBe('refuse')
    expect(decide('Network.deleteCookies', { name: 'a', domain: 'bank.example.org' }, page).do).toBe('refuse')
  })

  it('checks every cookie of a batch', () => {
    const ok = { name: 'a', value: '1', domain: 'app.example.com' }
    expect(decide('Network.setCookies', { cookies: [ok, ok] }, page).do).toBe('forward')
    expect(decide('Network.setCookies', { cookies: [ok, { ...ok, domain: 'bank.example.org' }] }, page).do).toBe('refuse')
  })
})

describe('typing: done on the page itself, never through the app’s focus', () => {
  it('inserts text', () => {
    expect(decide('Input.insertText', { text: 'Prat' }, page)).toEqual({ do: 'type', steps: [{ insertText: 'Prat' }] })
  })

  it('types a character as a key down with its text, then a key up', () => {
    expect(decide('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', text: 'a' }, page)).toEqual({ do: 'type', steps: [{ input: { type: 'keyDown', keyCode: 'a', modifiers: [] } }, { input: { type: 'char', keyCode: 'a', modifiers: [] } }] })
    expect(decide('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a' }, page)).toEqual({ do: 'type', steps: [{ input: { type: 'keyUp', keyCode: 'a', modifiers: [] } }] })
  })

  it('names the special keys the way Electron does, and carries the modifiers', () => {
    const named = (key: string, modifiers = 0) => (decide('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, modifiers }, page) as { steps: { input: { keyCode: string; modifiers: string[] } }[] }).steps[0]!.input
    expect(named('Enter').keyCode).toBe('Return')
    expect(named('ArrowLeft').keyCode).toBe('Left')
    expect(named('Backspace').keyCode).toBe('Backspace')
    expect(named('a', 2 | 8).modifiers).toEqual(['control', 'shift'])
    expect(named('a', 1 | 4).modifiers).toEqual(['alt', 'meta'])
  })

  it('refuses a key it does not know', () => {
    expect(decide('Input.dispatchKeyEvent', { type: 'keyDown', key: 'MediaPlayPause' }, page).do).toBe('refuse')
  })
})
