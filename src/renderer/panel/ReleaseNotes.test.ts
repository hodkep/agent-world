// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { notesHtml } from './ReleaseNotes'

const html = (md: string) => {
  const box = document.createElement('div')
  box.innerHTML = notesHtml(md)
  return box
}

describe('release notes as clean HTML', () => {
  it('keep the words, lists and emphasis', () => {
    const box = html('## Fixed\n\n- A **bold** thing\n- `code` too')
    expect(box.querySelector('h2')?.textContent).toBe('Fixed')
    expect(box.querySelectorAll('li')).toHaveLength(2)
    expect(box.querySelector('strong')?.textContent).toBe('bold')
    expect(box.querySelector('code')?.textContent).toBe('code')
  })
  it('lose scripts, event handlers, pictures, frames, styles, forms and classes', () => {
    const box = html('<script>window.pwned = 1</script><img src="x" onerror="alert(1)"> ![pic](https://x.test/a.png)\n\n<iframe src="https://x.test"></iframe><style>*{display:none}</style><form action="https://x.test"><input name="a"></form><p class="update-chip" style="color:red" onclick="alert(1)">hi</p>')
    expect(box.querySelectorAll('script, img, iframe, style, form, input')).toHaveLength(0)
    const p = box.querySelector('p.update-chip, p[style], p[onclick]')
    expect(p).toBeNull()
    expect(box.querySelector('p')?.getAttribute('class')).toBeNull()
    expect(box.textContent).toContain('hi')
  })
  it('keep only https links, each with its real host shown beside the words and as its title', () => {
    const box = html('[Spec](https://example.com/spec) [Plain](http://example.com) [Mail](mailto:a@b.c) [Rel](/docs) [JS](javascript:alert(1)) [Data](data:text/html,x)')
    const links = [...box.querySelectorAll('a')]
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['https://example.com/spec'])
    expect(links[0]!.textContent).toBe('Spec (example.com)')
    expect(links[0]!.getAttribute('title')).toBe('https://example.com/spec')
    // The others stay as words, not links.
    expect(box.textContent).toContain('Plain')
    expect(box.textContent).toContain('JS')
  })
  it('does not repeat the host when the words already are the address', () => {
    const box = html('<https://example.com/a>')
    expect(box.querySelector('a')?.textContent).toBe('https://example.com/a')
  })
  it('shows the real host of a link whose words name another place', () => {
    const box = html('[github.com/hodkep](https://evil.example/login)')
    expect(box.querySelector('a')?.textContent).toBe('github.com/hodkep (evil.example)')
  })
})
