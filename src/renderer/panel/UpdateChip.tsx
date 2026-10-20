import { useEffect, useRef, useState } from 'react'
import { BREW_UPGRADE, type InstallState } from '../../shared/updateInstall'
import { NotesBox } from './ReleaseNotes'
import { type UpdateAction, type UpdateView, updateView } from './updateView'

export type UpdateInfo = { homebrew?: boolean; state: 'off' | 'checking' | 'none' | 'available' | 'ready' | 'error'; detail?: string; latest?: string; url?: string; notes?: string; tag?: string; current?: string; install?: InstallState }

// What the last look found, kept for the whole window so a screen opened after it (Settings) still knows.
let last: UpdateInfo = { state: 'off' }
const listeners = new Set<(s: UpdateInfo) => void>()
let started = false
const publish = (s: UpdateInfo) => {
  last = s
  listeners.forEach((l) => l(s))
}

/** What the app last found about a newer version: said by the app as it looks, and asked for once for a window that opened after it. */
export function useUpdateInfo(): UpdateInfo {
  const [info, setInfo] = useState(last)
  useEffect(() => {
    if (!started) {
      started = true
      void window.aw.updateState().then((s) => last.state === 'off' && publish(s), () => undefined)
      window.aw.onUpdateState(publish)
    }
    listeners.add(setInfo)
    setInfo(last)
    return () => void listeners.delete(setInfo)
  }, [])
  return info
}

/** What a press of one of the update buttons does. */
export function runUpdateAction(id: UpdateAction['id'], info: UpdateInfo, close?: () => void) {
  const quiet = () => undefined
  switch (id) {
    case 'download':
    case 'retry':
      return void window.aw.downloadUpdate().catch(quiet)
    case 'cancel':
      return void window.aw.cancelUpdateDownload().catch(quiet)
    case 'install':
      return void window.aw.installUpdate().catch(quiet)
    case 'later':
      return close?.()
    case 'copy':
      return void navigator.clipboard.writeText(BREW_UPGRADE).catch(quiet)
    case 'page':
    case 'changes':
      return void (info.url && window.aw.openExternal(info.url).catch(quiet))
    case 'finder':
      return void window.aw.revealUpdate('file').catch(quiet)
    case 'log':
      return void window.aw.revealUpdate('log').catch(quiet)
  }
}

/** The words, progress and buttons of the update, as the popover under the chip and Settings both show them. */
export function UpdatePanel({ view, info, close }: { view: UpdateView; info: UpdateInfo; close?: () => void }) {
  return (
    <div className="upd-panel" role="group" aria-label="Update">
      <b className="upd-title">{view.title}</b>
      {view.progress && (
        <>
          <div className={`upd-bar ${view.progress.ok ? 'ok' : ''}`} role="progressbar" aria-label="Download" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(view.progress.fraction * 100)}>
            <i style={{ width: `${Math.round(view.progress.fraction * 100)}%` }} />
          </div>
          {view.progress.label && (
            <div className="upd-meter">
              <span>{view.progress.label}</span>
              <span>{Math.round(view.progress.fraction * 100)}%</span>
            </div>
          )}
        </>
      )}
      {view.ticks && (
        <ul className="upd-ticks">
          {view.ticks.map((t) => (
            <li key={t}>✓ {t}</li>
          ))}
        </ul>
      )}
      {view.error && <div className="upd-error" role="alert">{view.error}</div>}
      {view.warning && <div className="upd-warn" role="status">{view.warning}</div>}
      {view.body && <p className="upd-body">{view.body}</p>}
      {view.command && <code className="upd-cmd">{view.command}</code>}
      {view.notes && (
        <>
          <b className="upd-notes-title">What's new in {info.latest}</b>
          <NotesBox markdown={view.notes} label={`What's new in ${info.latest}`} />
        </>
      )}
      {view.actions.length > 0 && (
        <div className="upd-acts">
          {view.actions.map((a) =>
            a.id === 'changes' ? (
              <button key={a.id} className="su-link" onClick={() => runUpdateAction(a.id, info, close)}>{a.label}</button>
            ) : (
              <button key={a.id} className={a.primary ? 'primary' : ''} onClick={() => runUpdateAction(a.id, info, close)}>{a.label}</button>
            )
          )}
        </div>
      )}
    </div>
  )
}

/** A brass chip in the top bar for a newer version (its text is the version, or how far the download is); it opens a popover that downloads and installs it. */
export function UpdateChip({ agents }: { agents: { working: number; waiting: number } }) {
  const info = useUpdateInfo()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => (document.removeEventListener('mousedown', away), document.removeEventListener('keydown', esc))
  }, [open])
  const view = updateView(info, agents)
  if (!view) return null
  const say = `Agent World ${info.latest} is available`
  return (
    <div className="upd-wrap" ref={root}>
      <button className="update-chip" aria-label={view.title} aria-expanded={open} aria-haspopup="dialog" title={say} onClick={() => setOpen((o) => !o)}>
        {view.chip}
      </button>
      {open && (
        <div className="upd-pop" role="dialog" aria-label="Agent World update">
          <UpdatePanel view={view} info={info} close={() => setOpen(false)} />
        </div>
      )}
    </div>
  )
}
