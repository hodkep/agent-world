// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { markBroken, notesHtml } from './ReleaseNotes'

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

describe('pictures in release notes', () => {
  const OURS = 'https://raw.githubusercontent.com/hodkep/agent-world/v0.7.0/docs/images/releases/0.7.0/notes.png'
  it('keep a picture from the repository on GitHub, full width with its words under it, loaded lazily', () => {
    const box = html(`Notes.\n\n![The Notes window with a checklist](${OURS})\n\nMore.`)
    const fig = box.querySelector('figure.rn-shot')!
    expect(fig).not.toBeNull()
    const img = fig.querySelector('img')!
    expect(img.getAttribute('src')).toBe(OURS)
    expect(img.getAttribute('alt')).toBe('The Notes window with a checklist')
    expect(img.getAttribute('loading')).toBe('lazy')
    expect(fig.querySelector('figcaption')?.textContent).toBe('The Notes window with a checklist')
    expect(box.querySelectorAll('p')).toHaveLength(2)
  })
  it('keep a small icon in a heading as it is: its size, no caption', () => {
    const box = html(`### <img src="https://raw.githubusercontent.com/hodkep/agent-world/v0.7.0/docs/images/icons/notes.svg" width="20" height="20" alt=""> Notes\n\nWords.`)
    const img = box.querySelector('h3 img')!
    expect(img).not.toBeNull()
    expect(img.getAttribute('width')).toBe('20')
    expect(img.getAttribute('height')).toBe('20')
    expect(box.querySelector('figure, figcaption')).toBeNull()
    expect(box.querySelector('h3')?.textContent?.trim()).toBe('Notes')
  })
  it('keep only the source, the words, the size and lazy loading on a picture', () => {
    const box = html(`<img src="${OURS}" alt="A" srcset="https://evil.example/t.png 1x" style="width:1px" onerror="alert(1)" referrerpolicy="unsafe-url" crossorigin="use-credentials" class="update-chip" id="x" title="t" data-x="1">`)
    const img = box.querySelector('img')!
    expect([...img.attributes].map((a) => a.name).sort()).toEqual(['alt', 'loading', 'src'])
  })
  it('drop a picture from anywhere else: another host, a look-alike host, another repository, http, data and javascript', () => {
    const bad = [
      'https://example.com/a.png',
      'https://raw.githubusercontent.com.evil.example/hodkep/agent-world/a.png',
      'https://raw.githubusercontent.com@evil.example/hodkep/agent-world/a.png',
      'https://evil.example/raw.githubusercontent.com/hodkep/agent-world/a.png',
      'https://raw.githubusercontent.com/other/repo/a.png',
      'https://raw.githubusercontent.com/hodkep/agent-world-evil/a.png',
      'http://raw.githubusercontent.com/hodkep/agent-world/a.png',
      'data:image/png;base64,AAAA',
      'javascript:alert(1)'
    ]
    for (const src of bad) {
      const box = html(`![alt words](${src})\n\n<img src="${src}" alt="alt words">`)
      expect(box.querySelector('img, figure'), src).toBeNull()
    }
  })
  it('leave the words of a picture that did not load, in its place', () => {
    const box = html(`![The Notes window](${OURS})`)
    const img = box.querySelector('img')!
    markBroken(img)
    expect(box.querySelector('img')).toBeNull()
    expect(box.querySelector('figure.rn-shot.rn-gone')?.textContent).toBe('The Notes window')
  })
})
