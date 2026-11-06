/**
 * What a tool may ask of the one page it is given (an agent's Preview page): pure, so it is tested without Electron.
 * Anything not named here is refused, with a reason the tool shows its agent.
 */
export type TypeStep = { insertText: string } | { input: { type: 'keyDown' | 'keyUp' | 'char'; keyCode: string; modifiers: string[] } }
export type Decision =
  | { do: 'refuse'; why: string }
  | { do: 'reply'; result: object }
  | { do: 'forward'; params: object }
  | { do: 'navigate'; url: string; params: object }
  | { do: 'type'; steps: TypeStep[] }

/** The areas of the protocol that drive a page. The tools send about twenty commands from these (checked against agent-browser and Playwright). */
const OPEN = new Set(['Page', 'Runtime', 'DOM', 'Input', 'Network', 'Accessibility', 'Emulation', 'Log', 'Console', 'Fetch', 'CSS', 'DOMSnapshot', 'Performance', 'WebMCP', 'Inspector'])

/** Inside an open area, what is still refused: it reaches outside the page, or the person's files, or every site's logins. */
const REFUSED: Record<string, string> = {
  'Page.close': 'closing the Preview page is the person’s choice',
  'Page.crash': 'crashing the Preview page is not allowed',
  'Page.setInterceptFileChooserDialog': 'file choosers and uploads are not available here',
  'DOM.setFileInputFiles': 'file choosers and uploads are not available here',
  'Network.getAllCookies': 'only the cookies of the page being shown can be read',
  'Network.clearBrowserCookies': 'clearing every site’s cookies is not allowed (the person does it from Site data)',
  'Network.clearBrowserCache': 'clearing the cache is not allowed (the person does it from Site data)',
  'Network.loadNetworkResource': 'loading resources outside the page is not available here'
}

const KEYS: Record<string, string> = { Enter: 'Return', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete', Escape: 'Escape', ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', ' ': 'Space' }
/** CDP's modifier bits: alt 1, ctrl 2, meta 4, shift 8. */
const mods = (m = 0) => (['alt', 'control', 'meta', 'shift'] as const).filter((_, i) => m & (1 << i))

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}
/** A cookie for `domain` reaches the page at `host`: the page's own site, or a parent of it. Never a name that merely ends the same way. */
const reaches = (domain: string, host: string) => {
  const d = domain.replace(/^\./, '').toLowerCase()
  return d !== '' && (host === d || host.endsWith(`.${d}`))
}

type Cookie = { domain?: string; url?: string }
const cookieOk = (c: Cookie, host: string) => (c.domain ? reaches(c.domain, host) : c.url ? reaches(hostOf(c.url), host) : true)

function key(p: { type?: string; key?: string; text?: string; modifiers?: number }): Decision {
  const k = p.key ?? ''
  const keyCode = KEYS[k] ?? (k.length === 1 ? k : '')
  if (!keyCode) return { do: 'refuse', why: `the key ${JSON.stringify(k)} is not supported here` }
  const modifiers = mods(p.modifiers)
  const input = (type: 'keyDown' | 'keyUp' | 'char', code = keyCode) => ({ input: { type, keyCode: code, modifiers } })
  if (p.type === 'keyUp') return { do: 'type', steps: [input('keyUp')] }
  if (p.type === 'char') return { do: 'type', steps: [input('char', p.text || keyCode)] }
  return { do: 'type', steps: [input('keyDown'), ...(p.text ? [input('char', p.text)] : [])] }
}

export function decide(method: string, params: Record<string, any> = {}, page: { url: string }): Decision {
  const area = method.split('.')[0]!
  if (!OPEN.has(area)) return { do: 'refuse', why: `${method} is not available to a browser tool here` }
  if (REFUSED[method]) return { do: 'refuse', why: REFUSED[method]! }
  const host = hostOf(page.url)
  switch (method) {
    // The Preview's frame takes the size, so the page really has it (a page told to pretend, inside a smaller view, draws tiled): the tool is answered here.
    case 'Emulation.setDeviceMetricsOverride':
    case 'Emulation.clearDeviceMetricsOverride':
    case 'Page.setDownloadBehavior':
      return { do: 'reply', result: {} }
    case 'Page.navigate':
      return typeof params.url === 'string' && params.url ? { do: 'navigate', url: params.url, params } : { do: 'refuse', why: 'Page.navigate needs an address' }
    case 'Input.dispatchDragEvent':
      return params.data?.files?.length ? { do: 'refuse', why: 'dragging files into the page is not available here' } : { do: 'forward', params }
    case 'Input.insertText':
      return { do: 'type', steps: [{ insertText: String(params.text ?? '') }] }
    case 'Input.dispatchKeyEvent':
      return key(params)
    case 'Network.getCookies': {
      const { urls: _other, ...own } = params
      return { do: 'forward', params: own }
    }
    case 'Network.setCookie':
    case 'Network.deleteCookies': {
      if (!cookieOk(params, host)) return { do: 'refuse', why: 'cookies can only be set or deleted for the page being shown' }
      return { do: 'forward', params: params.domain || params.url ? params : { ...params, url: page.url } }
    }
    case 'Network.setCookies':
      return (params.cookies ?? []).every((c: Cookie) => cookieOk(c, host)) ? { do: 'forward', params } : { do: 'refuse', why: 'cookies can only be set or deleted for the page being shown' }
    default:
      return { do: 'forward', params }
  }
}
