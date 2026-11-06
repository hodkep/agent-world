import { screenKind, sentence, type Action } from '../../shared/browserAction'

/**
 * What a command to the page says the agent is doing, in the words the frame's tab shows: a short label for the pill and, where it helps, the thing it is done to.
 * Pure. The few things only the page knows (the name of the control under the pointer, the field typed into) are asked for through `lookup`.
 */
export type { Action }
export { sentence }
export interface Said {
  action: Action
  lookup?: { at: [number, number] } | { focus: true }
  /** The size the agent set; null when it put it back. */
  size?: { w: number; h: number; label: string } | null
}

const short = (url: string) => {
  try {
    const u = new URL(url)
    return (u.host + (u.pathname === '/' ? '' : u.pathname) + u.search).slice(0, 80)
  } catch {
    return url.slice(0, 80)
  }
}
const BACK = { action: { pill: 'RESIZING', target: 'back to the Preview’s size' }, size: null } as const
const NOT_ALLOWED = 'not allowed here'

export function actionOf(method: string, p: Record<string, any> = {}): Said | null {
  switch (method) {
    case 'Page.navigate':
      return { action: { pill: 'OPENING', target: short(String(p.url ?? '')) } }
    case 'Page.reload':
      return { action: { pill: 'RELOADING' } }
    case 'Page.navigateToHistoryEntry':
      return { action: { pill: 'GOING BACK' } }
    case 'Input.dispatchMouseEvent': {
      if (p.type === 'mouseWheel') return { action: { pill: 'SCROLLING', target: p.deltaY ? (p.deltaY > 0 ? 'down' : 'up') : p.deltaX > 0 ? 'right' : 'left' } }
      if (p.type !== 'mousePressed') return null
      const pill = p.button === 'right' ? 'RIGHT-CLICK' : p.clickCount >= 2 ? 'DOUBLE-CLICK' : 'CLICKING'
      return { action: { pill }, lookup: { at: [Number(p.x) || 0, Number(p.y) || 0] } }
    }
    case 'Input.insertText':
      return { action: { pill: 'TYPING' }, lookup: { focus: true } }
    case 'Input.dispatchKeyEvent': {
      if (p.type === 'keyUp') return null
      if (p.text || String(p.key ?? '').length === 1) return { action: { pill: 'TYPING' }, lookup: { focus: true } }
      return { action: { pill: 'PRESSING', target: String(p.key ?? '') } }
    }
    case 'Input.dispatchDragEvent':
      return p.data?.files?.length ? { action: { pill: 'DROP FILE', target: NOT_ALLOWED, refused: true } } : { action: { pill: 'DRAGGING' } }
    case 'DOM.setFileInputFiles':
    case 'Page.setInterceptFileChooserDialog':
      return { action: { pill: 'UPLOAD FILE', target: NOT_ALLOWED, refused: true } }
    case 'Emulation.setDeviceMetricsOverride': {
      const w = Number(p.width)
      const h = Number(p.height)
      if (!w && !h) return BACK
      const label = screenKind(w)
      return { action: { pill: 'RESIZING', target: `${w} × ${h} · ${label}` }, size: { w, h, label } }
    }
    case 'Emulation.clearDeviceMetricsOverride':
      return BACK
    case 'Page.captureScreenshot':
      return { action: { pill: 'SCREENSHOT', target: 'the page' } }
    case 'Accessibility.getFullAXTree':
    case 'DOMSnapshot.captureSnapshot':
      return { action: { pill: 'READING', target: 'the page' } }
    case 'Runtime.evaluate': {
      // The tool scrolls with a small script (scrollBy, scrollTo): that is scrolling, and which way it goes can be read from the number.
      const expr = String(p.expression ?? '')
      if (/\bscroll(By|To|IntoView)\b|\.scroll\(/.test(expr)) {
        const dy = Number(/scrollBy\(\s*(?:-?\d+(?:\.\d+)?\s*,\s*|\{[^}]*?top\s*:\s*)(-?\d+(?:\.\d+)?)/.exec(expr)?.[1])
        return { action: { pill: 'SCROLLING', ...(dy ? { target: dy > 0 ? 'down' : 'up' } : {}) } }
      }
      return { action: { pill: 'SCRIPT', low: true } }
    }
    case 'Runtime.callFunctionOn':
      return { action: { pill: 'SCRIPT', low: true } }
    default:
      return null
  }
}
