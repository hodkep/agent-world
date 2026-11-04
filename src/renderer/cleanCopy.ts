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

const BLOCK = /^(H[1-6]|UL|OL|LI|TABLE|THEAD|TBODY|TR|PRE|P|DIV|BLOCKQUOTE|HR|SECTION|ARTICLE|FIGURE|DL)$/

// A node on its own line(s): a block tag, or a wrapper that holds blocks. Text and inline elements next to each other are one line, as they read.
const isBlock = (n: Node): n is Element => n instanceof Element && (BLOCK.test(n.tagName) || [...n.children].some((c) => BLOCK.test(c.tagName)))

function children(el: Node): string {
  const out: string[] = []
  let run: Node[] = []
  const flush = () => {
    const line = run.map(inline).join('').trim()
    if (line) out.push(line)
    run = []
  }
  for (const n of el.childNodes) {
    if (isBlock(n)) {
      flush()
      const b = block(n)
      if (b) out.push(b)
    } else run.push(n)
  }
  flush()
  return out.join('\n\n')
}

/** The selection as markdown. */
export function toMarkdown(fragment: DocumentFragment): string {
  return children(fragment)
}

/** The words of a node as they are shown, with the breaks they have: `keep` is a code block, where every space and line break counts. */
function words(node: Node, keep: boolean): string {
  if (node.nodeType === 3) return keep ? (node.textContent ?? '').replace(/\u00a0/g, ' ') : (node.textContent ?? '').replace(/\s+/g, ' ')
  if (node instanceof Element && (SKIP.has(node.tagName.toUpperCase()) || node.tagName === 'BR')) return node.tagName === 'BR' ? '\n' : ''
  return [...node.childNodes].map((c) => words(c, keep)).join('')
}

const inPre = (r: Range) => {
  const at = r.commonAncestorContainer
  return !!(at instanceof Element ? at : at.parentElement)?.closest('pre')
}

/**
 * What a copy of these ranges puts on the clipboard: a pick inside a code block is its text and nothing else (no fences or backticks, line breaks kept),
 * a pick inside one paragraph is plain words as they read, and a pick across blocks is markdown, so lists, tables and code keep their shape.
 */
export function selectionText(ranges: Range[]): string {
  const frags = ranges.map((r) => r.cloneContents())
  const code = (n: ParentNode) => words(n, true).replace(/\n$/, '')
  if (ranges.every(inPre)) return frags.map(code).join('\n')
  const frag = document.createDocumentFragment()
  frag.append(...frags)
  // A pick that starts in a block and ends just after it (a triple click) clones to that block alone.
  const kept = [...frag.childNodes].filter((n) => (n.textContent ?? '').trim() || (n instanceof Element && n.tagName === 'PRE'))
  if (kept.length === 1 && kept[0] instanceof Element && kept[0].tagName === 'PRE') return code(kept[0])
  if (![...frag.childNodes].some(isBlock)) return words(frag, false).replace(/ *\n */g, '\n').trim()
  return toMarkdown(frag)
}

/** Replaces the browser's own clipboard HTML on every copy of page text; a copy out of a text field is left to the browser. */
export function installCleanCopy(): () => void {
  const onCopy = (e: ClipboardEvent) => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.rangeCount || !e.clipboardData) return
    const t = e.target
    if (t instanceof HTMLElement && (t.closest('input, textarea') || t.isContentEditable)) return
    const ranges = Array.from({ length: sel.rangeCount }, (_, i) => sel.getRangeAt(i))
    // Text only, with no HTML beside it: a target that prefers HTML would otherwise get the tags back.
    e.clipboardData.setData('text/plain', selectionText(ranges) || sel.toString())
    e.preventDefault()
  }
  document.addEventListener('copy', onCopy)
  return () => document.removeEventListener('copy', onCopy)
}
