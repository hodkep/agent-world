import { pixelIconMarkup } from './PixelIcon'
import { RUN_EVENT, runnable } from './runnable'
import DOMPurify from 'dompurify'
import 'katex/dist/katex.min.css'
import { type RendererThis, type Token, type TokenizerAndRendererExtension, type TokenizerThis, type Tokens, marked } from 'marked'
import markedAlert from 'marked-alert'
import markedFootnote from 'marked-footnote'
import { gfmHeadingId } from 'marked-gfm-heading-id'
import markedKatex from 'marked-katex-extension'
import { useEffect, useMemo, useRef, useState } from 'react'
import { languageFor, monaco } from '../code/monaco'
import { followLink, linkHint } from '../links'
import { openFileEvent } from '../files/context'
import { handleFileClick, linkifyFiles } from '../files/linkify'
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
    for (const a of el.querySelectorAll<HTMLAnchorElement>('a[href^="http"]')) a.title ||= linkHint(a.href)
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
      // A shell command can also be run, in the project's terminal.
      const code = pre.querySelector('code')
      const command = runnable(/language-([\w+-]+)/.exec(code?.className ?? '')?.[1] ?? '', code?.textContent ?? '')
      if (command) {
        const run = document.createElement('button')
        run.className = 'copy run'
        run.innerHTML = pixelIconMarkup('play')
        run.setAttribute('aria-label', 'Run in terminal')
        run.title = 'Run in terminal: types this into a terminal in the project folder and presses Enter'
        run.onclick = () => window.dispatchEvent(new CustomEvent(RUN_EVENT, { detail: { text: command } }))
        pre.appendChild(run)
      }
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
    void linkifyFiles(el, agentId ?? '')
  }, [html, agentId])
  return (
    <div
      ref={box}
      className="md"
      // The HTML above has been through DOMPurify.
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={(e) => {
        if (handleFileClick(e, agentId ?? '')) return
        const a = (e.target as HTMLElement).closest('a')
        if (!a) return
        e.preventDefault()
        // A link to a file on this machine opens it here.
        const href = a.getAttribute('href') ?? ''
        if (agentId && (href.startsWith('file://') || /^\/[^/]/.test(href))) return openFileEvent(agentId, decodeURI(href.replace(/^file:\/\//, '')))
        // A link to a heading or footnote in this same message scrolls there; anything else opens outside the app.
        const id = a.getAttribute('href')?.startsWith('#') ? decodeURIComponent(a.getAttribute('href')!.slice(1)) : null
        if (id !== null) return void box.current?.querySelector(`[id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'start' })
        followLink(a.href, e, agentId)
      }}
    />
  )
}

/** A short piece of code or a command, coloured like the code blocks in a reply, with a Copy button. */
export function Code({ text, lang, className = '', prompt }: { text: string; lang: string; className?: string; prompt?: string }) {
  const code = useRef<HTMLElement>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    const el = code.current
    if (!el) return
    el.textContent = text
    void monaco.editor
      .colorize(text, lang, { tabSize: 2 })
      .then((h) => {
        if (code.current === el) el.innerHTML = DOMPurify.sanitize(h).replace(/(<br\/?>)+$/, '')
      })
      .catch(() => {})
  }, [text, lang])
  return (
    <pre className={`code-block ${className}`}>
      {prompt && <span className="code-prompt" aria-hidden="true">{prompt}</span>}
      <code ref={code} />
      <button
        className="copy always"
        onClick={() => void navigator.clipboard.writeText(text).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1200)))}
        aria-label="Copy"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </pre>
  )
}
