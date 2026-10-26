// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { toMarkdown } from './cleanCopy'

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
