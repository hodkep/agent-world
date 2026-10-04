/** A page on this machine that the Preview tab can show: its webview only ever reaches plain-http local addresses. */
export function isPreviewable(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
  } catch {
    return false
  }
}

/** What was typed into the Preview bar as an address on this machine: a port, host:port, or a full http address; null for anything else. */
export function localAddress(text: string): string | null {
  const t = text.trim()
  if (!t) return null
  const full = /^https?:\/\//i.test(t) ? t : /^\d{1,5}$/.test(t) ? `http://localhost:${t}` : `http://${t}`
  return isPreviewable(full) ? new URL(full).href : null
}

export const PREVIEW_EVENT = 'aw-preview'

/**
 * What a click on a link does anywhere in the chat: a local page opens in the Preview tab, ⌘-click or Ctrl-click opens it in
 * the browser instead, and addresses on the internet always go to the browser (the Preview tab never loads them).
 */
export function followLink(url: string, e: { metaKey: boolean; ctrlKey: boolean }, agentId?: string) {
  if (agentId && !e.metaKey && !e.ctrlKey && isPreviewable(url)) window.dispatchEvent(new CustomEvent(PREVIEW_EVENT, { detail: { agentId, url } }))
  else void window.aw.openExternal(url).catch(() => {})
}

export const linkHint = (url: string) => (isPreviewable(url) ? 'Click: open in the Preview tab · ⌘/Ctrl-click: open in the browser' : 'Opens in your browser')
