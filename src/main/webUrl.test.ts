import { describe, expect, it } from 'vitest'
import { isWebUrl } from './webUrl'

describe('what a preview pane may be at', () => {
  it('is any http or https address, and nothing else', () => {
    expect(isWebUrl('https://example.com/a?b=1')).toBe(true)
    expect(isWebUrl('http://localhost:5173/')).toBe(true)
    expect(isWebUrl('http://192.168.1.20:3000/')).toBe(true)
    for (const u of ['file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,hi', 'chrome://gpu', 'ftp://example.com', 'blob:https://example.com/x', 'about:blank', '', 'not a url', 'https://']) expect(isWebUrl(u), u).toBe(false)
  })
})
