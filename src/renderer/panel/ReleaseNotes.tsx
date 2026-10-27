import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReleaseNotes } from '../../shared/changelog'

/** Where the notes' pictures may come from: the repository itself on GitHub, by a tag or a commit, and nowhere else. */
const PICTURES = { host: 'raw.githubusercontent.com', path: '/hodkep/agent-world/' }
const ours = (src: string): boolean => {
  try {
    const u = new URL(src)
    return u.protocol === 'https:' && u.hostname === PICTURES.host && u.username === '' && u.password === '' && u.pathname.startsWith(PICTURES.path)
  } catch {
    return false
  }
}

/**
 * Release notes (Markdown from a changelog or a release page) as clean HTML: no scripts, no forms, no classes or styles (so a note cannot borrow the app's looks),
 * only https links, and only the repository's own pictures. Each link shows the host it really goes to beside its words, so words cannot hide the address.
 * A picture on a line of its own is full width with its words under it; a small one in a heading (a feature's icon) stays where it is.
 */
export function notesHtml(markdown: string): string {
  const clean = DOMPurify.sanitize(marked.parse(markdown, { async: false }) as string, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['picture', 'source', 'svg', 'style', 'form', 'input', 'button', 'textarea', 'select', 'iframe', 'video', 'audio', 'object', 'embed'],
    FORBID_ATTR: ['style', 'srcset', 'class', 'id', 'name']
    // Only https addresses are kept: the loops below drop every other link and picture (a URI rule here would also drop a picture's width and height).
  })
  const box = document.createElement('template')
  box.innerHTML = clean
  for (const img of box.content.querySelectorAll('img')) {
    const src = img.getAttribute('src') ?? ''
    if (!ours(src)) {
      img.remove()
      continue
    }
    // Only what a picture needs: where it is, its words, its size; and it loads when it comes into view.
    const keep = { src, alt: img.getAttribute('alt') ?? '', width: img.getAttribute('width'), height: img.getAttribute('height') }
    for (const a of [...img.attributes]) img.removeAttribute(a.name)
    img.setAttribute('src', keep.src)
    img.setAttribute('alt', keep.alt)
    if (keep.width && /^\d+$/.test(keep.width)) img.setAttribute('width', keep.width)
    if (keep.height && /^\d+$/.test(keep.height)) img.setAttribute('height', keep.height)
    img.setAttribute('loading', 'lazy')
    const p = img.parentElement
    if (p?.tagName === 'P' && p.childNodes.length === 1) {
      const fig = document.createElement('figure')
      fig.className = 'rn-shot'
      fig.append(img)
      if (keep.alt) {
        const cap = document.createElement('figcaption')
        cap.textContent = keep.alt
        fig.append(cap)
      }
      p.replaceWith(fig)
    }
  }
  for (const a of box.content.querySelectorAll('a')) {
    const href = a.getAttribute('href')
    let host = ''
    try {
      host = href ? new URL(href).hostname : ''
    } catch {
      /* not an address: it is words below */
    }
    if (!href || !host || !/^https:/i.test(href)) {
      a.replaceWith(...a.childNodes)
      continue
    }
    a.setAttribute('title', href)
    a.setAttribute('rel', 'noopener noreferrer')
    const words = a.textContent ?? ''
    if (!words.includes(host)) a.append(` (${host})`)
  }
  return box.innerHTML
}

/** A picture that did not load (offline, or gone) leaves its words in its place; a small icon that did not load goes. */
export function markBroken(img: HTMLImageElement) {
  const fig = img.closest('figure.rn-shot')
  if (fig) fig.classList.add('rn-gone')
  img.remove()
}

/** The notes of a version, read in a small box; a link in them opens in the browser, nowhere else. */
export function NotesBox({ markdown, className = '', label }: { markdown: string; className?: string; label?: string }) {
  const html = useMemo(() => notesHtml(markdown), [markdown])
  const box = useRef<HTMLDivElement>(null)
  return (
    <div
      ref={box}
      className={`notes md ${className}`}
      role="region"
      aria-label={label ?? "What's new"}
      tabIndex={0}
      // The HTML has been through DOMPurify above.
      dangerouslySetInnerHTML={{ __html: html }}
      onErrorCapture={(e) => { if (e.target instanceof HTMLImageElement) markBroken(e.target) }}
      onClick={(e) => {
        const a = (e.target as HTMLElement).closest('a')
        if (!a) return
        e.preventDefault()
        const href = a.getAttribute('href') ?? ''
        if (/^https:/i.test(href)) void window.aw.openExternal(href).catch(() => undefined)
      }}
    />
  )
}

/** The installed version's notes, from the changelog that came with the app. */
export function WhatsNew({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [info, setInfo] = useState<Awaited<ReturnType<typeof window.aw.appInfo>> | null>(null)
  useEffect(() => {
    // The dialog is shown from a button; closing it puts focus back on that button (a dialog taken out of the page does not).
    const opener = document.activeElement as HTMLElement | null
    dialog.current?.showModal()
    void window.aw.appInfo().then(setInfo, () => setInfo({ version: '', notes: null }))
    return () => opener?.focus()
  }, [])
  const notes: ReleaseNotes | null = info?.notes ?? null
  return (
    <dialog ref={dialog} className="settings whats-new" aria-label={`What's new in ${info?.version ?? ''}`} onClose={onClose} onCancel={onClose}>
      <header className="settings-head">
        <b>What's new in {info?.version || 'this version'}</b>
        <button onClick={onClose}>Close</button>
      </header>
      <div className="wn-body">
        {!info && <span className="hint">Reading…</span>}
        {info && notes && (
          <>
            {notes.date && <span className="hint">Released {notes.date} · from the changelog that came with this app</span>}
            <NotesBox markdown={notes.body} className="wn-notes" label={`Notes of ${notes.version}`} />
          </>
        )}
        {info && !notes && <p className="hint">This build's changelog has no notes for {info.version || 'this version'}.</p>}
      </div>
    </dialog>
  )
}
