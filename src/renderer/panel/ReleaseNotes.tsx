import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReleaseNotes } from '../../shared/changelog'

/** Release notes (Markdown from a changelog or a release page) as clean HTML: no scripts, no pictures, no forms, and only web and mail links. */
export function notesHtml(markdown: string): string {
  const clean = DOMPurify.sanitize(marked.parse(markdown, { async: false }) as string, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['img', 'picture', 'source', 'svg', 'style', 'form', 'input', 'button', 'textarea', 'select', 'iframe', 'video', 'audio', 'object', 'embed'],
    FORBID_ATTR: ['style', 'srcset', 'src'],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i
  })
  return clean
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
    dialog.current?.showModal()
    void window.aw.appInfo().then(setInfo, () => setInfo({ version: '', notes: null }))
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
