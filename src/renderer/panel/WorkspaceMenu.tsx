import { useEffect, useRef, useState } from 'react'
import type { WorkspaceInfo, Workspaces } from '../../shared/api'

/** The header's project switcher: the folders worked in before, newest first, and a way to open another. */
export function WorkspaceMenu({
  workspaces,
  onOpen,
  onPick,
  onForget,
  onNewWindow
}: {
  workspaces: Workspaces | null
  onOpen: (path: string) => void
  onPick: () => void
  onForget: (path: string) => void
  onNewWindow: () => void
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const active = workspaces?.items.find((w) => w.path === workspaces.active)

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', esc)
    }
  }, [open])

  const choose = (w: WorkspaceInfo) => {
    if (!w.exists) return
    setOpen(false)
    if (w.path !== workspaces?.active) onOpen(w.path)
  }

  return (
    <div className="ws" ref={root}>
      <button className="ws-button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} title={workspaces?.active ?? 'Choose a project folder'}>
        <span className="ws-name">{active?.name ?? (workspaces?.active ? workspaces.active.split(/[\\/]/).pop() : 'Choose a project')}</span>
        {active && <span className={`ws-tag ${active.git ? 'git' : ''}`}>{active.git ? 'git' : 'no git'}</span>}
        <span className="ws-caret" aria-hidden="true" />
      </button>
      {open && (
        <div className="ws-menu" role="menu" aria-label="Projects">
          {workspaces && workspaces.items.length > 0 ? (
            <ul>
              {workspaces.items.map((w) => (
                <li key={w.path} className={w.path === workspaces.active ? 'on' : ''}>
                  <button role="menuitem" className="ws-item" onClick={() => choose(w)} disabled={!w.exists} title={w.exists ? w.path : `${w.path} (missing)`}>
                    <span className="ws-item-name">{w.name}</span>
                    <span className="ws-item-path">{w.exists ? w.path : 'folder is missing'}</span>
                    <span className="ws-item-tags">
                      <span className={`ws-tag ${w.git ? 'git' : ''}`}>{w.git ? 'git' : 'no git'}</span>
                      {w.agents > 0 && <span className="ws-tag">{w.agents} agent{w.agents === 1 ? '' : 's'}</span>}
                    </span>
                  </button>
                  {w.saved && (
                    <button className="ws-forget" onClick={() => onForget(w.path)} aria-label={`Forget ${w.name}`} title="Forget this project (nothing on disk is deleted)" />
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">Projects you work in appear here.</p>
          )}
          <button
            className="ws-open"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onPick()
            }}
          >
            Open another folder…
          </button>
          <button
            className="ws-open"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onNewWindow()
            }}
            title="Another window onto the same agents, to work in a different project"
          >
            New window
          </button>
        </div>
      )}
    </div>
  )
}
