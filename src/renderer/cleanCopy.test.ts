// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { installCleanCopy, selectionText, toMarkdown } from './cleanCopy'

const md = (html: string) => {
  const box = document.createElement('div')
  box.innerHTML = html
  const frag = document.createDocumentFragment()
  frag.append(...box.childNodes)
  return toMarkdown(frag)
}

describe('what a copy from the app puts on the clipboard', () => {
  it('is the text as markdown, without the styles the page wears', () => {
    const out = md('<h2 style="color:red" class="x">Goal</h2><p>No <strong>OOM</strong>, see <code>pd.concat</code> and <a href="https://a.b">this</a>.</p><ul><li>one</li><li>two<ul><li>deep</li></ul></li></ul><ol><li>first</li><li>second</li></ol><script>1</script>')
    expect(out).toBe('## Goal\n\nNo **OOM**, see `pd.concat` and [this](https://a.b).\n\n- one\n- two\n  - deep\n\n1. first\n2. second')
  })

  it('keeps a table as a markdown table', () => {
    const out = md('<div class="table-wrap"><table><thead><tr><th>Step</th><th>Pass</th></tr></thead><tbody><tr><td>1</td><td>ok | yes</td></tr></tbody></table></div>')
    expect(out).toBe('| Step | Pass |\n| --- | --- |\n| 1 | ok \\| yes |')
  })

  it('keeps a code block fenced', () => {
    expect(md('<pre><code>a\nb</code></pre>')).toBe('```\na\nb\n```')
  })
})

// A selection as the browser makes it: a Range over the page, not a whole element.
const page = (html: string) => {
  const box = document.createElement('div')
  box.innerHTML = html
  document.body.replaceChildren(box)
  return box
}
const text = (box: Element, find: string) => {
  const w = document.createTreeWalker(box, NodeFilter.SHOW_TEXT)
  for (let n = w.nextNode(); n; n = w.nextNode()) if ((n.textContent ?? '').includes(find)) return n
  throw new Error(`no text ${find}`)
}
const range = (a: Node, from: number, b: Node, to: number) => {
  const r = document.createRange()
  r.setStart(a, from)
  r.setEnd(b, to)
  return r
}
const inside = (box: Element, find: string, from = 0, len = find.length) => {
  const t = text(box, find)
  const at = (t.textContent ?? '').indexOf(find) + from
  return range(t, at, t, at + len)
}

describe('what a copy of part of a reply puts on the clipboard', () => {
  it('is the words as shown when they sit in one span each: no line per word', () => {
    const box = page('<p><span>admin</span> <span>override</span> <span>on</span> <a href="https://x/278">#278</a></p>')
    const r = range(text(box, 'admin'), 0, text(box, '#278'), 4)
    expect(selectionText([r])).toBe('admin override on #278')
  })

  it('is a sentence from the middle of a paragraph as it reads, with links and code as their words', () => {
    const box = page('<p>We merged <strong>both</strong> fixes, see <code>pd.concat</code> and <a href="u">this</a> note.</p>')
    const r = range(text(box, 'both'), 0, text(box, ' note.'), 6)
    expect(selectionText([r])).toBe('both fixes, see pd.concat and this note.')
  })

  it('keeps the line breaks the reply shows inside one paragraph', () => {
    const box = page('<p>first line<br>second line<br>third</p>')
    const r = range(text(box, 'first'), 0, text(box, 'third'), 5)
    expect(selectionText([r])).toBe('first line\nsecond line\nthird')
  })

  it('keeps paragraphs apart across blocks, one blank line, and no line per inline piece', () => {
    const box = page('<p>One <em>two</em> three.</p><p>Four <a href="u">five</a>.</p>')
    const r = range(text(box, 'One '), 0, text(box, '.'), 1)
    const out = selectionText([range(text(box, 'One '), 0, text(box, 'five'), 4)])
    expect(out).toBe('One *two* three.\n\nFour [five](u)')
    expect(r.toString()).toContain('One')
  })

  it('is a command picked in a code block as just its text: no backticks, no extra lines', () => {
    const box = page('<pre><code class="language-sh">df -h /\n</code><button>Copy</button></pre>')
    const code = box.querySelector('code')!
    const whole = document.createRange()
    whole.selectNodeContents(code)
    expect(selectionText([whole])).toBe('df -h /')
    expect(selectionText([inside(box, 'df -h /', 0, 5)])).toBe('df -h')
    // The pick that takes the code element itself (a triple click, or a drag over the block's whole line): the clone is a lone <code>.
    const element = document.createRange()
    element.selectNode(code)
    expect(selectionText([element])).toBe('df -h /')
    // A pick that starts in the block and ends in the next paragraph still gives only the command.
    const more = page('<pre><code>df -h /\n</code></pre><p></p>')
    const toNext = range(text(more, 'df'), 0, more.querySelector('p')!, 0)
    expect(selectionText([toNext])).toBe('df -h /')
  })

  it('keeps a block of four commands as four lines with single line breaks', () => {
    const box = page('<pre><code>git status\npnpm install\npnpm test\npnpm build\n</code></pre>')
    const code = box.querySelector('code')!
    const whole = document.createRange()
    whole.selectNodeContents(code)
    expect(selectionText([whole])).toBe('git status\npnpm install\npnpm test\npnpm build')
    const r = range(text(box, 'git'), 4, text(box, 'git'), 'git status\npnpm install\npnpm test'.length)
    expect(selectionText([r])).toBe('status\npnpm install\npnpm test')
  })

  it('leaves out the Copy and Run buttons when the whole block is picked', () => {
    const box = page('<pre><code>ls -la\n</code><button class="copy">Copy</button><button class="copy run"><svg></svg></button></pre>')
    const whole = document.createRange()
    whole.selectNodeContents(box.querySelector('pre')!)
    expect(selectionText([whole])).toBe('ls -la')
  })

  it('still fences a code block when a pick runs from prose into it', () => {
    const box = page('<p>Run this:</p><pre><code>pnpm test\n</code></pre>')
    const r = range(text(box, 'Run'), 0, text(box, 'pnpm'), 4)
    expect(selectionText([r])).toBe('Run this:\n\n```\npnpm\n```')
  })

  it('is what the copy event writes: the picked words, as plain text only, and the default is stopped', () => {
    const box = page('<p><span>admin</span> <span>override</span> <span>on</span> <a href="u">#278</a></p><pre><code>df -h /\n</code></pre>')
    const off = installCleanCopy()
    const sel = window.getSelection()!
    const put = (r: Range) => {
      sel.removeAllRanges()
      sel.addRange(r)
      const set: Record<string, string> = {}
      const e = Object.assign(new Event('copy', { bubbles: true, cancelable: true }), { clipboardData: { setData: (k: string, v: string) => (set[k] = v) } })
      box.dispatchEvent(e)
      return { set, stopped: e.defaultPrevented }
    }
    const said = put(range(text(box, 'admin'), 0, text(box, '#278'), 4))
    expect(said.set).toEqual({ 'text/plain': 'admin override on #278' })
    expect(said.stopped).toBe(true)
    const code = document.createRange()
    code.selectNode(box.querySelector('code')!)
    expect(put(code).set).toEqual({ 'text/plain': 'df -h /' })
    off()
  })
})
