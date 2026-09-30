import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { useEffect, useMemo, useRef } from 'react'
import { languageFor, monaco } from '../code/monaco'

marked.setOptions({ gfm: true, breaks: false })
// Code blocks are coloured by Monaco's tokenizer, in the same theme as the Code tab.
monaco.editor.setTheme('agent-world')

/** Assistant text as sanitized HTML; code blocks get Monaco's colouring afterwards; links open outside the app. */
export function Markdown({ text }: { text: string }) {
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(text, { async: false }) as string, { USE_PROFILES: { html: true } }), [text])
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = box.current
    if (!el) return
    for (const pre of el.querySelectorAll<HTMLElement>('pre')) {
      if (pre.querySelector(':scope > .copy')) continue
      const b = document.createElement('button')
      b.className = 'copy'
      b.textContent = 'Copy'
      b.onclick = () => void navigator.clipboard.writeText(pre.querySelector('code')?.textContent ?? pre.textContent ?? '').then(() => ((b.textContent = 'Copied'), setTimeout(() => (b.textContent = 'Copy'), 1200)))
      pre.appendChild(b)
    }
    for (const code of el.querySelectorAll<HTMLElement>('pre > code')) {
      const lang = /language-([\w+-]+)/.exec(code.className)?.[1]
      if (!lang) continue
      const id = languageFor(`x.${lang}`) !== 'plaintext' ? languageFor(`x.${lang}`) : lang
      void monaco.editor
        .colorize(code.textContent ?? '', id, { tabSize: 2 })
        .then((h) => {
          // Monaco returns already-escaped markup for exactly this text.
          code.innerHTML = DOMPurify.sanitize(h).replace(/(<br\/?>)+$/, '')
        })
        .catch(() => {})
    }
  }, [html])
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
        void window.aw.openExternal(a.href).catch(() => {})
      }}
    />
  )
}
