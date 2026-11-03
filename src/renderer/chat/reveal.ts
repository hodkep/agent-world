/** The most words a reply may have to be revealed word by word; a longer one just appears. */
const MAX_WORDS = 800
/** The pause between words, and the longest the whole reveal may take. */
const STEP_MS = 30
const TOTAL_MS = 1800
/** Above this many words the reveal is a plain fade: many words are in the air at once and a blur on each is costly to draw. */
const BLUR_WORDS = 200
/** Text that is shown as it is: code, code blocks, pictures, buttons and diagrams. */
const SKIP = new Set(['PRE', 'CODE', 'SVG', 'SCRIPT', 'STYLE', 'BUTTON', 'TEXTAREA'])

/** A word, or a task named as `todo #9` (with its space), which stays whole so the chat can still make it one link. Whitespace between words is kept as it was. */
const PIECES = /\S*?todo ?#\d{1,6}\S*|\S+|\s+/gi

const wordsIn = (el: Node, out: Text[] = []): Text[] => {
  for (const c of Array.from(el.childNodes)) {
    if (c.nodeType === 3) out.push(c as Text)
    else if (c.nodeType === 1 && !SKIP.has((c as Element).tagName.toUpperCase()) && !(c as Element).classList.contains('mermaid')) wordsIn(c, out)
  }
  return out
}

/**
 * Wraps every word of a reply in a span numbered in order, so a stylesheet can fade them in one after another (`--i` is the number,
 * `--step` the pause between words on the reply itself). False, and nothing changed, for a reply too long to be worth it.
 */
export function revealWords(root: HTMLElement): boolean {
  const nodes = wordsIn(root)
  const total = nodes.reduce((n, t) => n + ((t.nodeValue ?? '').match(PIECES) ?? []).filter((p) => /\S/.test(p)).length, 0)
  if (total === 0 || total > MAX_WORDS) return false
  root.style.setProperty('--step', `${Math.min(STEP_MS, TOTAL_MS / total)}ms`)
  root.style.setProperty('--blur', total > BLUR_WORDS ? '0px' : '4px')
  let n = 0
  for (const t of nodes) {
    const parts = (t.nodeValue ?? '').match(PIECES) ?? []
    if (!parts.some((p) => p && !/^\s+$/.test(p))) continue
    const frag = document.createDocumentFragment()
    for (const p of parts) {
      if (!p) continue
      if (/^\s+$/.test(p)) frag.appendChild(document.createTextNode(p))
      else {
        const s = document.createElement('span')
        s.className = 'w-r'
        s.textContent = p
        s.style.setProperty('--i', String(n++))
        frag.appendChild(s)
      }
    }
    t.replaceWith(frag)
  }
  return true
}

const GRACE_MS = 1500
const FRESH_MS = 1000
const BURST = 3

/**
 * Which messages arrived while the chat was being watched: not those of its first moments (the history is loading), not a crowd
 * that arrives together (a history read again), and only for a second after arriving, so a message scrolled back to does not play again.
 */
export class FreshTracker {
  private known = new Set<string>()
  private fresh = new Map<string, number>()
  constructor(private readonly since: number) {}

  see(ids: string[], now: number): void {
    const added = ids.filter((id) => !this.known.has(id))
    for (const id of added) this.known.add(id)
    if (now - this.since < GRACE_MS || added.length > BURST) return
    for (const id of added) this.fresh.set(id, now)
  }

  isFresh(id: string, now: number): boolean {
    const at = this.fresh.get(id)
    return at !== undefined && now - at < FRESH_MS
  }
}
