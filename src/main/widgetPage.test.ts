import { describe, expect, it } from 'vitest'
import { EMPTY_MOD, type ChatModState } from '../shared/chatMod'
import { WIDGET_CSP, widgetPage, widgetResponse } from './widgetPage'

const widget = { id: 'spend', slot: 'above-composer' as const, height: 32, html: '<b id="n">…</b><script>onData(d => n.textContent = d.meters.cost)</script>', meters: ['cost' as const], fetch: [], series: [] }
const state = (over: Partial<ChatModState> = {}): ChatModState => ({ current: { ...EMPTY_MOD, widgets: [widget] }, draft: null, draftBy: null, draftWhy: '', history: 0, draftData: false, recent: [], ...over })

describe('the page a widget runs in', () => {
  it('cuts it off from everything: no network, no frames, no forms, no objects, no base, and a sandbox even if it is opened bare', () => {
    for (const d of ['sandbox allow-scripts', "default-src 'none'", "connect-src 'none'", "script-src-attr 'none'", "worker-src 'none'", "frame-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'", "img-src data:"]) expect(WIDGET_CSP, d).toContain(d)
    expect(WIDGET_CSP).not.toMatch(/allow-same-origin|allow-top-navigation|allow-popups|allow-forms|allow-modals|unsafe-eval|https?:|\*/)
  })
  it('holds the agent\'s html and the way numbers come in, and nothing that sends anything out', () => {
    const page = widgetPage(widget.html)
    expect(page).toContain(widget.html)
    expect(page).toContain("addEventListener('message'")
    expect(page).not.toMatch(/postMessage|fetch\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|parent\./)
  })
  it('takes numbers and theme colours only from its parent, and applies colours as CSS variables, never as markup', () => {
    const page = widgetPage('x')
    expect(page).toContain('e.source !== parent')
    expect(page).toContain('setProperty')
    expect(page).not.toContain('innerHTML')
  })
})

describe('serving a widget', () => {
  it('answers a kept widget and a draft one by their address, with the page\'s own security headers', async () => {
    const r = widgetResponse(state(), 'aw-widget://look/current/spend?v=1')!
    expect(r.status).toBe(200)
    expect(r.headers.get('content-security-policy')).toBe(WIDGET_CSP)
    expect(r.headers.get('x-content-type-options')).toBe('nosniff')
    expect(r.headers.get('referrer-policy')).toBe('no-referrer')
    expect(r.headers.get('cache-control')).toBe('no-store')
    expect(await r.text()).toContain(widget.html)
    const d = widgetResponse(state({ current: EMPTY_MOD, draft: { ...EMPTY_MOD, widgets: [{ ...widget, html: '<i>draft</i>' }] } }), 'aw-widget://look/draft/spend')!
    expect(await d.text()).toContain('<i>draft</i>')
  })
  it('answers nothing for a widget that is not there, an address of another shape, or another host', () => {
    expect(widgetResponse(state(), 'aw-widget://look/current/other')!.status).toBe(404)
    expect(widgetResponse(state(), 'aw-widget://look/draft/spend')!.status).toBe(404)
    expect(widgetResponse(state(), 'aw-widget://elsewhere/current/spend')!.status).toBe(404)
    expect(widgetResponse(state(), 'aw-widget://look/current/spend/../../x')!.status).toBe(404)
    expect(widgetResponse(state(), 'not a url')!.status).toBe(404)
    expect(widgetResponse(state(), 'aw-widget://look/current/Spend')!.status).toBe(404)
  })
})
