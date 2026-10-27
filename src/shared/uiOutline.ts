// An outline of the app's own markup, for an agent that has to find the part of the window to restyle: tags, class names and labels, never the words on the page (they are other agents' chats and your todos). It runs inside the page (it is sent there as text), so it uses nothing but the page's own DOM.

/** The elements under `selector` (the whole app when empty) as indented lines: tag.class#id [label], `depth` levels deep. */
export function outlineOf(doc: ParentNode, selector: string, depth: number): string {
  const MAX = 400
  const SKIP = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'PATH', 'CIRCLE', 'RECT', 'G', 'LINE', 'POLYGON'])
  const OPAQUE = new Set(['CANVAS', 'SVG', 'IFRAME', 'TEXTAREA', 'INPUT', 'SELECT'])
  const sel = selector.trim() || '.app'
  let start: Element | null
  try {
    start = doc.querySelector(sel)
  } catch {
    return `${sel} is not a valid selector.`
  }
  if (!start) return `Nothing matches ${sel}.`
  const lines: string[] = []
  let more = 0
  const walk = (el: Element, level: number) => {
    if (SKIP.has(el.tagName.toUpperCase())) return
    if (lines.length >= MAX) return void more++
    const cls = [...el.classList].filter((c) => !c.startsWith('aw-')).slice(0, 6).map((c) => `.${c}`).join('')
    const id = el.id ? `#${el.id}` : ''
    const label = el.getAttribute('aria-label') || (el.getAttribute('role') && !el.getAttribute('aria-label') ? el.getAttribute('role') : '')
    const flags = el.hasAttribute('hidden') ? ' (hidden)' : ''
    lines.push(`${'  '.repeat(level)}${el.tagName.toLowerCase()}${cls}${id}${label ? ` [${label}]` : ''}${flags}`)
    if (OPAQUE.has(el.tagName.toUpperCase())) return
    const kids = [...el.children].filter((k) => !SKIP.has(k.tagName.toUpperCase()))
    if (level >= depth) {
      if (kids.length) lines.push(`${'  '.repeat(level + 1)}… ${kids.length} deeper`)
      return
    }
    for (const k of kids) walk(k, level + 1)
  }
  walk(start, 0)
  return lines.join('\n') + (more ? `\n… ${more} more not shown: ask for a narrower selector.` : '')
}
