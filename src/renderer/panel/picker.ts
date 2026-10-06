/** What the user pointed at on the page. */
export interface PickedElement {
  url: string
  selector: string
  tag: string
  text: string
  html: string
  styles: Record<string, string>
  /** Position in the page's own window, for the picture. */
  rect: { x: number; y: number; width: number; height: number }
}

export const PICK_MARK = '__AW_PICK__'

/**
 * Run inside the previewed page: outline what the pointer is over, and on a click report that element
 * (through the console, which the app is listening to) instead of letting the page handle the click. Esc cancels.
 */
export const PICKER_SOURCE = `(() => {
  if (window.__awPicking) return
  window.__awPicking = true
  const box = document.createElement('div')
  box.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;border:2px solid #f2c230;background:rgba(242,194,48,.15);transition:all .05s;top:0;left:0;width:0;height:0'
  document.documentElement.appendChild(box)
  const prevCursor = document.documentElement.style.cursor
  document.documentElement.style.cursor = 'crosshair'
  let target = null
  const label = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + [...el.classList].slice(0, 2).map((c) => '.' + c).join('')
  const selectorOf = (el) => {
    const parts = []
    for (let n = el; n && n.nodeType === 1 && parts.length < 5; n = n.parentElement) {
      let part = label(n)
      if (!n.id && n.parentElement) {
        const same = [...n.parentElement.children].filter((c) => c.tagName === n.tagName)
        if (same.length > 1) part += ':nth-of-type(' + (same.indexOf(n) + 1) + ')'
      }
      parts.unshift(part)
      if (n.id) break
    }
    return parts.join(' > ')
  }
  const move = (e) => {
    const el = document.elementFromPoint(e.clientX, e.clientY)
    if (!el || el === box) return
    target = el
    const r = el.getBoundingClientRect()
    Object.assign(box.style, { top: r.top + 'px', left: r.left + 'px', width: r.width + 'px', height: r.height + 'px' })
  }
  const done = (payload) => {
    window.removeEventListener('mousemove', move, true)
    window.removeEventListener('click', click, true)
    window.removeEventListener('keydown', key, true)
    window.removeEventListener('mousedown', swallow, true)
    window.removeEventListener('mouseup', swallow, true)
    box.remove()
    document.documentElement.style.cursor = prevCursor
    window.__awPicking = false
    console.log('${PICK_MARK}' + JSON.stringify(payload))
  }
  const swallow = (e) => (e.preventDefault(), e.stopPropagation())
  const click = (e) => {
    swallow(e)
    const el = target || e.target
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    const styles = {}
    for (const k of ['color', 'backgroundColor', 'fontFamily', 'fontSize', 'fontWeight', 'display', 'position', 'width', 'height', 'margin', 'padding', 'borderRadius']) styles[k] = cs[k]
    const html = el.outerHTML.replace(/\\s+/g, ' ')
    done({
      url: location.href,
      selector: selectorOf(el),
      tag: el.tagName.toLowerCase(),
      text: (el.innerText || '').trim().replace(/\\s+/g, ' ').slice(0, 200),
      html: html.length > 1200 ? html.slice(0, 1200) + '…' : html,
      styles,
      rect: { x: Math.max(0, Math.round(r.left)), y: Math.max(0, Math.round(r.top)), width: Math.round(r.width), height: Math.round(r.height) }
    })
  }
  const key = (e) => { if (e.key === 'Escape') (swallow(e), done(null)) }
  window.addEventListener('mousemove', move, true)
  window.addEventListener('click', click, true)
  window.addEventListener('mousedown', swallow, true)
  window.addEventListener('mouseup', swallow, true)
  window.addEventListener('keydown', key, true)
})()`

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()

/** The screen size the page was shown at when something on it was picked. */
export interface ViewInfo {
  label: string
  w: number
  h: number
}
const viewLine = (v: ViewInfo) => `View: ${v.label} ${v.w}×${v.h}`

/** The browser's own answer for a style tells the agent nothing, so it is not sent. */
const PLAIN: Record<string, string[]> = { position: ['static'], fontWeight: ['400', 'normal'], display: ['inline'] }
const HTML_CAP = 240

/** The words that go into the message: where the element is, what it is, how it looks. The picture travels as an attachment. */
export function contextText(p: PickedElement): string {
  const look = Object.entries(p.styles)
    .filter(([k, v]) => v && v !== 'none' && v !== '0px' && v !== 'rgba(0, 0, 0, 0)' && !PLAIN[k]?.includes(v))
    .map(([k, v]) => `${k}: ${oneLine(v)}`)
    .join('; ')
  const html = p.html.length > HTML_CAP ? `${p.html.slice(0, HTML_CAP)}…` : p.html
  return [`Element picked from ${p.url}`, `Selector: ${p.selector}`, p.text && `Text: "${p.text}"`, `HTML: ${html}`, look && `Computed style: ${look}`].filter(Boolean).join('\n')
}

/** What was picked, as it goes into the message: the view is named once when every element was seen in the same one. */
export function pickedMessage(items: { text: string; view?: ViewInfo }[]): string {
  const views = items.map((i) => (i.view ? viewLine(i.view) : ''))
  const once = views[0] && views.every((v) => v === views[0])
  const head = once ? `${views[0]}\n` : ''
  return head + items.map((i, n) => (!once && views[n] ? `${views[n]}\n${i.text}` : i.text)).join('\n\n')
}
