// Chromium copies a selection as HTML with every element's computed style inline, so pasting a chat message into a light page or a document brought the app's dark theme with it.
// The clipboard gets the structure only (headings, lists, tables, bold) and the plain text beside it.

/** The selection as HTML without styles, classes, ids, data attributes or scripts. */
export function cleanHtml(fragment: DocumentFragment): string {
  const box = document.createElement('div')
  box.append(fragment.cloneNode(true))
  box.querySelectorAll('script, style').forEach((n) => n.remove())
  for (const el of box.querySelectorAll('*'))
    for (const a of [...el.attributes]) if (a.name === 'style' || a.name === 'class' || a.name === 'id' || a.name.startsWith('data-')) el.removeAttribute(a.name)
  return box.innerHTML
}

/** Replaces the browser's own clipboard HTML on every copy of page text; a copy out of a text field is left to the browser. */
export function installCleanCopy(): () => void {
  const onCopy = (e: ClipboardEvent) => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.rangeCount || !e.clipboardData) return
    const t = e.target
    if (t instanceof HTMLElement && (t.closest('input, textarea') || t.isContentEditable)) return
    const frag = document.createDocumentFragment()
    for (let i = 0; i < sel.rangeCount; i++) frag.append(sel.getRangeAt(i).cloneContents())
    e.clipboardData.setData('text/plain', sel.toString())
    e.clipboardData.setData('text/html', cleanHtml(frag))
    e.preventDefault()
  }
  document.addEventListener('copy', onCopy)
  return () => document.removeEventListener('copy', onCopy)
}
