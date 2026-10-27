import type { ChatModState } from '../shared/chatMod'

export const WIDGET_SCHEME = 'aw-widget'

// A widget page may draw and compute and nothing else: it cannot connect anywhere, open anything, submit anything or reach the app. `sandbox` is also here so the page is cut off even if something opens it bare.
export const WIDGET_CSP = ["sandbox allow-scripts", "default-src 'none'", "script-src 'unsafe-inline'", "style-src 'unsafe-inline'", 'img-src data:', 'font-src data:', "media-src 'none'", "worker-src 'none'", "connect-src 'none'", "frame-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"].join('; ')

// Numbers and colours come in from the window that holds the frame; nothing goes out, and the page has no way to send anything.
const PRELUDE = `<script>
(() => {
  let last = {}
  const subs = []
  addEventListener('message', (e) => {
    if (e.source !== parent) return
    const d = e.data
    if (!d || d.type !== 'data') return
    for (const [k, v] of Object.entries(d.theme || {})) if (/^--[a-z0-9-]+$/.test(k) && typeof v === 'string') document.documentElement.style.setProperty(k, v)
    last = d
    for (const f of subs) try { f(d) } catch {}
  })
  window.onData = (f) => { subs.push(f); try { f(last) } catch {} }
})()
</script>`

export function widgetPage(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:transparent;color:var(--text,#e4e4ee);font:12px ui-sans-serif,system-ui,sans-serif}</style>${PRELUDE}</head><body>${html}</body></html>`
}

const gone = () => new Response('', { status: 404, headers: { 'Cache-Control': 'no-store' } })

/** The answer to a widget's address, aw-widget://look/<current|draft>/<id>, from what the app holds: the page, or nothing. */
export function widgetResponse(state: ChatModState, address: string): Response {
  let u: URL
  try {
    u = new URL(address)
  } catch {
    return gone()
  }
  const m = /^\/(current|draft)\/([a-z0-9][a-z0-9-]{0,29})$/.exec(u.pathname)
  if (u.protocol !== `${WIDGET_SCHEME}:` || u.host !== 'look' || !m) return gone()
  const mod = m[1] === 'draft' ? state.draft : state.current
  const w = mod?.widgets.find((x) => x.id === m[2])
  if (!w) return gone()
  return new Response(widgetPage(w.html), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': WIDGET_CSP, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' }
  })
}
