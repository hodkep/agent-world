import { describe, expect, it } from 'vitest'
import { shapeReply } from './shape'

describe('shaping a reply for reading', () => {
  it('draws a paragraph that starts with Note:, Important: or Warning: as the matching callout', () => {
    expect(shapeReply('<p><strong>Important:</strong> back up first.</p>')).toBe('<div class="markdown-alert markdown-alert-important"><p class="markdown-alert-title">Important</p><p>Back up first.</p></div>')
    expect(shapeReply('<p>Note: the cache is cold.</p>')).toBe('<div class="markdown-alert markdown-alert-note"><p class="markdown-alert-title">Note</p><p>The cache is cold.</p></div>')
    expect(shapeReply('<p>Warning: this deletes files.</p>')).toContain('markdown-alert-warning')
    expect(shapeReply('<p>Tip: run it twice.</p>')).toContain('markdown-alert-tip')
  })

  it('leaves a paragraph that only mentions a note further in', () => {
    const html = '<p>See the note: it is short.</p>'
    expect(shapeReply(html)).toBe(html)
  })

  it('labels a code block with its language', () => {
    expect(shapeReply('<pre><code class="language-ts">const a = 1\n</code></pre>')).toBe('<pre data-lang="ts"><code class="language-ts">const a = 1\n</code></pre>')
    expect(shapeReply('<pre><code>plain\n</code></pre>')).toBe('<pre><code>plain\n</code></pre>')
  })

  it('marks a bold lead-in at the start of a list item as its term', () => {
    expect(shapeReply('<ul>\n<li><strong>Tests.</strong> All pass.</li>\n<li>Plain item with <strong>bold</strong> later.</li>\n</ul>')).toBe(
      '<ul>\n<li class="has-term"><strong class="term">Tests.</strong> All pass.</li>\n<li>Plain item with <strong>bold</strong> later.</li>\n</ul>'
    )
    expect(shapeReply('<li><p><strong>Build.</strong> ok</p></li>')).toBe('<li class="has-term"><p><strong class="term">Build.</strong> ok</p></li>')
  })

  it('right-aligns the heading of a column whose every cell is a number', () => {
    expect(shapeReply('<table><thead><tr><th>File</th><th>Lines</th><th>Note</th></tr></thead><tbody><tr><td>a.ts</td><td>4</td><td>ok</td></tr><tr><td>b.ts</td><td>12</td><td>3</td></tr></tbody></table>')).toBe(
      '<table><thead><tr><th>File</th><th class="num">Lines</th><th>Note</th></tr></thead><tbody><tr><td>a.ts</td><td class="num">4</td><td>ok</td></tr><tr><td>b.ts</td><td class="num">12</td><td class="num">3</td></tr></tbody></table>'
    )
  })

  it('right-aligns the cells of a table that hold a number, a size, a share or a time', () => {
    expect(shapeReply('<tr><td>cart.ts</td><td>42</td><td>12.5%</td><td>1,204 ms</td><td>3.2 MB</td><td>v1.2</td></tr>')).toBe(
      '<tr><td>cart.ts</td><td class="num">42</td><td class="num">12.5%</td><td class="num">1,204 ms</td><td class="num">3.2 MB</td><td>v1.2</td></tr>'
    )
  })

  it('turns a command the agent opens a paragraph with into a command row, with the rest of the sentence under it', () => {
    expect(shapeReply('<p><code>ls -la</code> lists all files, including hidden ones.</p>')).toBe('<pre class="cmd" data-lang="sh"><code class="language-sh">ls -la</code></pre><p class="cmd-why">Lists all files, including hidden ones.</p>')
    expect(shapeReply('<p><code>npm test</code></p>')).toBe('<pre class="cmd" data-lang="sh"><code class="language-sh">npm test</code></pre>')
  })

  it('turns a command that ends a paragraph after a colon into a command row under it', () => {
    expect(shapeReply('<p>For files tracked by git only: <code>git ls-files</code>.</p>')).toBe('<p>For files tracked by git only:</p><pre class="cmd" data-lang="sh"><code class="language-sh">git ls-files</code></pre>')
  })

  it('leaves code that is not a command where it is, and a command in the middle of a sentence', () => {
    for (const html of ['<p><code>cartTotal</code> rounds the sum.</p>', '<p>Ran <code>ls -la</code>. Files: five.</p>', '<p>The value is: <code>0.3</code>.</p>']) expect(shapeReply(html)).toBe(html)
  })

  it('draws a one-line shell block as a command row too, and keeps a longer script a code block', () => {
    expect(shapeReply('<pre><code class="language-bash">pnpm install\n</code></pre>')).toBe('<pre class="cmd" data-lang="bash"><code class="language-bash">pnpm install\n</code></pre>')
    expect(shapeReply('<pre><code class="language-bash">cd app\npnpm install\n</code></pre>')).toBe('<pre data-lang="bash"><code class="language-bash">cd app\npnpm install\n</code></pre>')
  })

  it('keeps the numbering of a list that starts further on', () => {
    expect(shapeReply('<ol start="4">\n<li>Four</li>\n</ol>')).toBe('<ol start="4" style="counter-reset: step 3">\n<li>Four</li>\n</ol>')
  })
})
