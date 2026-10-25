/** What the message box draws over the text it holds, as ranges of that text; the text itself is never changed. */
export type LiveMark = {
  from: number
  to: number
  /** Line kinds (h1-h3, quote, codeline, fence, hide-line) have from === to, at the line's start. */
  kind: 'h1' | 'h2' | 'h3' | 'quote' | 'codeline' | 'fence' | 'hide-line' | 'bold' | 'italic' | 'code' | 'link' | 'bullet' | 'num' | 'hide' | 'marker'
}

type Sel = { from: number; to: number }

const INLINE = /(`)([^`\n]+)`|(\*\*)(\S[^*\n]*)\*\*|(?<![*\w])(\*)([^\s*](?:[^*\n]*[^\s*])?)\*(?!\*)|\[([^\]\n]+)\]\(([^)\s]+)\)/g

/**
 * Markdown as it is typed: marks of the line or span the text is, and the markers (`**`, `#`, a fence) to hide.
 * Markers show, dimmed, on every line the selection touches, and a fenced block shows its fences while the selection is anywhere in it.
 */
export function liveMarks(text: string, sel: Sel): LiveMark[] {
  const out: LiveMark[] = []
  const lines: { start: number; end: number; src: string }[] = []
  let at = 0
  for (const src of text.split('\n')) {
    lines.push({ start: at, end: at + src.length, src })
    at += src.length + 1
  }
  const touched = (i: number) => sel.from <= lines[i]!.end && sel.to >= lines[i]!.start

  // A fenced block: the opening fence, its lines, and the closing fence (or the end of the text).
  const fenceOf: ('open' | 'body' | 'close' | null)[] = lines.map(() => null)
  const blockActive: boolean[] = lines.map(() => false)
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]!.src.startsWith('```')) continue
    let close = i + 1
    while (close < lines.length && !lines[close]!.src.startsWith('```')) close++
    const last = Math.min(close, lines.length - 1)
    const active = lines.slice(i, last + 1).some((_, k) => touched(i + k))
    for (let k = i; k <= last; k++) {
      fenceOf[k] = k === i ? 'open' : k === close ? 'close' : 'body'
      blockActive[k] = active
    }
    i = last
  }

  lines.forEach((line, i) => {
    const { start, src } = line
    const fence = fenceOf[i]
    if (fence) {
      if (fence === 'body') out.push({ from: start, to: start, kind: 'codeline' })
      else out.push({ from: start, to: start, kind: blockActive[i] ? 'fence' : 'hide-line' })
      return
    }
    const shown = touched(i)
    const hide = (from: number, to: number) => out.push({ from, to, kind: shown ? 'marker' : 'hide' })

    let body = 0
    const head = /^(#{1,3})\s+/.exec(src)
    const quote = /^>\s?/.exec(src)
    const list = /^(\s*)([-*+]|\d+\.)\s+/.exec(src)
    if (head) {
      out.push({ from: start, to: start, kind: `h${head[1]!.length}` as 'h1' })
      hide(start, start + head[0].length)
      body = head[0].length
    } else if (quote) {
      out.push({ from: start, to: start, kind: 'quote' })
      hide(start, start + quote[0].length)
      body = quote[0].length
    } else if (list) {
      const mark = start + list[1]!.length
      if (/\d/.test(list[2]!)) out.push({ from: mark, to: mark + list[2]!.length, kind: 'num' })
      else if (!shown) out.push({ from: mark, to: mark + 1, kind: 'bullet' })
      body = list[0].length
    }

    for (const m of src.slice(body).matchAll(INLINE)) {
      const s = start + body + m.index!
      const e = s + m[0].length
      if (m[1]) {
        hide(s, s + 1)
        out.push({ from: s + 1, to: e - 1, kind: 'code' })
        hide(e - 1, e)
      } else if (m[3]) {
        hide(s, s + 2)
        out.push({ from: s + 2, to: e - 2, kind: 'bold' })
        hide(e - 2, e)
      } else if (m[5]) {
        hide(s, s + 1)
        out.push({ from: s + 1, to: e - 1, kind: 'italic' })
        hide(e - 1, e)
      } else {
        const label = s + 1 + m[7]!.length
        hide(s, s + 1)
        out.push({ from: s + 1, to: label, kind: 'link' })
        hide(label, e)
      }
    }
  })
  return out.sort((a, b) => a.from - b.from)
}
