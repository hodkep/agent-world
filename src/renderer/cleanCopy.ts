// Chromium copies a selection as HTML with every element's computed style inline, so pasting a chat message elsewhere brought the app's dark theme with it,
// and a message box that takes the HTML as text showed the tags. A copy from the app is the text as markdown, as it reads on screen.

const SKIP = new Set(['SCRIPT', 'STYLE', 'BUTTON', 'SVG'])

const cell = (el: Element) => inline(el).replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|').trim()

function inline(node: Node): string {
  if (node.nodeType === 3) return (node.textContent ?? '').replace(/\s+/g, ' ')
  if (!(node instanceof Element) || SKIP.has(node.tagName.toUpperCase())) return ''
  const inner = () => [...node.childNodes].map(inline).join('')
  switch (node.tagName) {
    case 'STRONG': case 'B': return `**${inner().trim()}**`
    case 'EM': case 'I': return `*${inner().trim()}*`
    case 'DEL': case 'S': return `~~${inner().trim()}~~`
    case 'CODE': return `\`${node.textContent}\``
    case 'A': return node.getAttribute('href') ? `[${inner()}](${node.getAttribute('href')})` : inner()
    case 'BR': return '\n'
    default: return inner()
  }
}

function list(el: Element, depth: number): string {
  const ordered = el.tagName === 'OL'
  return [...el.children]
    .filter((li) => li.tagName === 'LI')
    .map((li, i) => {
      const own = [...li.childNodes].filter((n) => !(n instanceof Element && /^[OU]L$/.test(n.tagName))).map(inline).join('').trim()
      const nested = [...li.children].filter((n) => /^[OU]L$/.test(n.tagName)).map((n) => '\n' + list(n, depth + 1)).join('')
      return `${'  '.repeat(depth)}${ordered ? `${i + 1}.` : '-'} ${own}${nested}`
    })
    .join('\n')
}

function table(el: Element): string {
  const rows = [...el.querySelectorAll('tr')].map((tr) => [...tr.children].map(cell))
  if (!rows.length) return ''
  const line = (r: string[]) => `| ${r.join(' | ')} |`
  return [line(rows[0]!), line(rows[0]!.map(() => '---')), ...rows.slice(1).map(line)].join('\n')
}

function block(node: Node): string {
  if (!(node instanceof Element)) return inline(node).trim()
  const tag = node.tagName
  if (SKIP.has(tag.toUpperCase())) return ''
  if (/^H[1-6]$/.test(tag)) return `${'#'.repeat(Number(tag[1]))} ${inline(node).trim()}`
  if (tag === 'UL' || tag === 'OL') return list(node, 0)
  if (tag === 'TABLE') return table(node)
  if (tag === 'PRE') return '```\n' + (node.textContent ?? '').replace(/\n$/, '') + '\n```'
  if (tag === 'HR') return '---'
  if (tag === 'BLOCKQUOTE') return children(node).split('\n').map((l) => `> ${l}`.trimEnd()).join('\n')
  if (tag === 'P') return inline(node).trim()
  // A wrapper (div, section, span…) holding blocks is walked through; one holding only text is a line of its own.
  return [...node.children].some((c) => /^(H[1-6]|UL|OL|TABLE|PRE|P|DIV|BLOCKQUOTE|HR)$/.test(c.tagName)) ? children(node) : inline(node).trim()
}

function children(el: Node): string {
  return [...el.childNodes].map(block).filter(Boolean).join('\n\n')
}

/** The selection as markdown. */
export function toMarkdown(fragment: DocumentFragment): string {
  return children(fragment)
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
    // Markdown only, with no HTML beside it: a target that prefers HTML would otherwise get the tags back.
    e.clipboardData.setData('text/plain', toMarkdown(frag) || sel.toString())
    e.preventDefault()
  }
  document.addEventListener('copy', onCopy)
  return () => document.removeEventListener('copy', onCopy)
}
