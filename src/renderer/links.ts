/** A page on this machine that the Preview tab can show: its webview only ever reaches plain-http local addresses. */
export function isPreviewable(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
  } catch {
    return false
  }
}

/** Any web page: an http or https address. */
export function isWebUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname !== ''
  } catch {
    return false
  }
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/
const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i

/**
 * What was typed into the Preview bar as an address: a port, host:port, a full http or https address, or a bare name like example.com
 * (shown as https). A machine by its number, or this one, is plain http; null for anything that is not a page.
 */
export function webAddress(text: string): string | null {
  const t = text.trim()
  if (!t || /\s/.test(t)) return null
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return isWebUrl(t) ? new URL(t).href : null
  if (/^\d{1,5}([/?#].*)?$/.test(t)) return fromParts(`http://localhost:${t}`)
  const host = /^([^/?#:]+|\[[^\]]+\])(:\d{1,5})?([/?#].*)?$/.exec(t)
  if (!host) return null
  const name = host[1]!.toLowerCase()
  if (name === 'localhost' || name === '[::1]') return fromParts(`http://${t}`)
  if (IPV4.test(name)) return fromParts(`http://${t}`)
  if (HOST.test(name)) return fromParts(`https://${t}`)
  return null
}

function fromParts(url: string): string | null {
  try {
    const u = new URL(url)
    return isWebUrl(url) && Number(u.port || 1) <= 65535 ? u.href : null
  } catch {
    return null
  }
}

export const PREVIEW_EVENT = 'aw-preview'

/**
 * What a click on a link does anywhere in the chat: a page opens in the Preview tab (an address on this computer, or a site on the
 * internet, which the Preview asks about once), and ⌘-click or Ctrl-click opens it in the browser instead.
 */
export function followLink(url: string, e: { metaKey: boolean; ctrlKey: boolean }, agentId?: string) {
  if (agentId && !e.metaKey && !e.ctrlKey && isWebUrl(url)) window.dispatchEvent(new CustomEvent(PREVIEW_EVENT, { detail: { agentId, url } }))
  else void window.aw.openExternal(url).catch(() => {})
}

export const linkHint = (url: string) => (isWebUrl(url) ? 'Click: open in the Preview tab · ⌘/Ctrl-click: open in the browser' : 'Opens in your browser')
