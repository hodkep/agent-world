import DOMPurify from 'dompurify'
import 'katex/dist/katex.min.css'
import { type RendererThis, type Token, type TokenizerAndRendererExtension, type TokenizerThis, type Tokens, marked } from 'marked'
import markedAlert from 'marked-alert'
import markedFootnote from 'marked-footnote'
import { gfmHeadingId } from 'marked-gfm-heading-id'
import markedKatex from 'marked-katex-extension'
import { useEffect, useMemo, useRef } from 'react'
import { languageFor, monaco } from '../code/monaco'
import { EMOJI } from './emoji'

marked.setOptions({ gfm: true, breaks: false })
// Code blocks are coloured by Monaco's tokenizer, in the same theme as the Code tab.
monaco.editor.setTheme('agent-world')

// Beyond GFM: footnotes, GitHub-style alerts (> [!NOTE]), maths ($x$ and $$x$$), heading ids for #anchors,
// definition lists, ==highlight==, ^superscript^, ~subscript~ and :emoji: shortcodes. Mermaid blocks are drawn afterwards.
marked.use(markedFootnote(), markedAlert(), markedKatex({ throwOnError: false }), gfmHeadingId())
marked.use({
  extensions: [
    {
      name: 'deflist',
      level: 'block',
      start: (src: string) => src.match(/\n[^\n:][^\n]*\n:[ \t]/)?.index,
      tokenizer(this: TokenizerThis, src: string): Tokens.Generic | undefined {
        const m = /^([^\n:][^\n]*)\n((?::[ \t]+[^\n]*(?:\n|$))+)/.exec(src)
        if (!m) return undefined
        const defs = m[2]!.split('\n').filter(Boolean).map((l) => l.replace(/^:[ \t]+/, ''))
        return { type: 'deflist', raw: m[0], term: this.lexer.inlineTokens(m[1]!), defs: defs.map((d) => this.lexer.inlineTokens(d)) }
      },
      renderer(this: RendererThis, t: Tokens.Generic) {
        return `<dl><dt>${this.parser.parseInline(t.term as Token[])}</dt>${(t.defs as Token[][]).map((d) => `<dd>${this.parser.parseInline(d)}</dd>`).join('')}</dl>\n`
      }
    },
    inline('mark', '==', /^==(?=\S)((?:\\.|[^=\\\n]|=(?!=))+?)==/, 'mark'),
    inline('sup', '^', /^\^(?=\S)((?:\\.|[^^\\\s])+?)\^/, 'sup'),
    inline('sub', '~', /^~(?=[^\s~])((?:\\.|[^~\\\s])+?)~(?!~)/, 'sub'),
    {
      name: 'emoji',
      level: 'inline',
      start: (src: string) => src.indexOf(':'),
      tokenizer(src: string): Tokens.Generic | undefined {
        const m = /^:([a-z0-9_+-]+):/.exec(src)
        const char = m && EMOJI[m[1]!]
        return m && char ? { type: 'emoji', raw: m[0], char } : undefined
      },
      renderer: (t: Tokens.Generic) => String(t.char)
    }
  ]
})

/** A small inline extension: text between `mark`… and the same mark closing becomes <tag>text</tag>. */
function inline(name: string, mark: string, re: RegExp, tag: string): TokenizerAndRendererExtension {
  return {
    name,
    level: 'inline',
    start: (src: string) => src.indexOf(mark),
    tokenizer(this: TokenizerThis, src: string): Tokens.Generic | undefined {
      const m = re.exec(src)
      return m ? { type: name, raw: m[0], tokens: this.lexer.inlineTokens(m[1]!) } : undefined
    },
    renderer(this: RendererThis, t: Tokens.Generic) {
      return `<${tag}>${this.parser.parseInline(t.tokens ?? [])}</${tag}>`
    }
  }
}

let mermaidCount = 0
async function drawMermaid(pre: HTMLElement, source: string) {
  try {
    const { default: mermaid } = await import('mermaid')
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'dark', htmlLabels: false, flowchart: { htmlLabels: false } })
    const { svg } = await mermaid.render(`mermaid-${++mermaidCount}`, source)
    const box = document.createElement('div')
    box.className = 'mermaid'
    box.innerHTML = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } })
    pre.replaceWith(box)
  } catch {
    pre.classList.add('mermaid-failed')
  }
}

/** Assistant text as sanitized HTML; code blocks get Monaco's colouring afterwards; links open outside the app. */
export function Markdown({ text, agentId }: { text: string; agentId?: string }) {
  // Tables sit in a box of their own that scrolls sideways, so a wide one keeps its column names readable.
  const html = useMemo(
    () =>
      DOMPurify.sanitize(marked.parse(text, { async: false }) as string, { USE_PROFILES: { html: true, mathMl: true } })
        .replace(/<table(\s|>)/g, '<div class="table-wrap"><table$1')
        .replace(/<\/table>/g, '</table></div>'),
    [text]
  )
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = box.current
    if (!el) return
    for (const code of el.querySelectorAll<HTMLElement>('pre > code.language-mermaid')) void drawMermaid(code.parentElement!, code.textContent ?? '')
    // Pictures that are files on disk (a path the agent mentions) are read by the main process, like attached ones.
    for (const img of el.querySelectorAll<HTMLImageElement>('img')) {
      const src = img.getAttribute('src') ?? ''
      if (!agentId || !src || /^(https?:|data:|blob:)/i.test(src) || img.dataset.local) continue
      img.dataset.local = '1'
      void window.aw.readImage(agentId, decodeURI(src.replace(/^file:\/\//, ''))).then((url) => url && (img.src = url), () => {})
    }
    for (const pre of el.querySelectorAll<HTMLElement>('pre')) {
      if (pre.querySelector(':scope > .copy') || pre.querySelector(':scope > code.language-mermaid')) continue
      const b = document.createElement('button')
      b.className = 'copy'
      b.textContent = 'Copy'
      b.onclick = () => void navigator.clipboard.writeText(pre.querySelector('code')?.textContent ?? pre.textContent ?? '').then(() => ((b.textContent = 'Copied'), setTimeout(() => (b.textContent = 'Copy'), 1200)))
      pre.appendChild(b)
    }
    for (const code of el.querySelectorAll<HTMLElement>('pre > code')) {
      const lang = /language-([\w+-]+)/.exec(code.className)?.[1]
      if (!lang || lang === 'mermaid') continue
      const id = languageFor(`x.${lang}`) !== 'plaintext' ? languageFor(`x.${lang}`) : lang
      void monaco.editor
        .colorize(code.textContent ?? '', id, { tabSize: 2 })
        .then((h) => {
          // Monaco returns already-escaped markup for exactly this text.
          code.innerHTML = DOMPurify.sanitize(h).replace(/(<br\/?>)+$/, '')
        })
        .catch(() => {})
    }
  }, [html, agentId])
  return (
    <div
      ref={box}
      className="md"
      // The HTML above has been through DOMPurify.
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={(e) => {
        const a = (e.target as HTMLElement).closest('a')
        if (!a) return
        e.preventDefault()
        // A link to a heading or footnote in this same message scrolls there; anything else opens outside the app.
        const id = a.getAttribute('href')?.startsWith('#') ? decodeURIComponent(a.getAttribute('href')!.slice(1)) : null
        if (id !== null) return void box.current?.querySelector(`[id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'start' })
        void window.aw.openExternal(a.href).catch(() => {})
      }}
    />
  )
}
