import { type KeyboardEvent, useState } from 'react'
import type { WorkspaceInfo, Workspaces } from '../../shared/api'
import type { Dot } from '../../shared/attention'
import { Identicon } from './Identicon'
import { useHoverMenu } from './hoverMenu'
import { QuickPanel } from './QuickPanel'

/** What is going on in a project's agents, for its tile: some wait for the person, some are working. */
export type WorkspaceActivity = { waiting: number; working: number }

/** More than this many projects and the panel gets a search box. */
export const SEARCH_FROM = 8

/** Projects that match what was typed (name or path), in the order given. */
export const filterWorkspaces = (items: WorkspaceInfo[], text: string) => {
  const q = text.trim().toLowerCase()
  return q ? items.filter((w) => w.name.toLowerCase().includes(q) || w.path.toLowerCase().includes(q)) : items
}

/**
 * The header's project switcher: resting on the button opens a grid of the folders worked in before, newest first, and one click on a tile switches.
 * A click on the button keeps the panel open until a click elsewhere or Esc.
 */
export function WorkspaceMenu({
  workspaces,
  activity = {},
  dot = null,
  finished = new Set<string>(),
  onOpen,
  onPick,
  onForget,
  onNewWindow
}: {
  workspaces: Workspaces | null
  activity?: Record<string, WorkspaceActivity>
  /** Another project needs you (red) or an agent in one finished unseen (green): a dot on the button. */
  dot?: Dot
  /** The projects where an agent finished and nothing has been opened since: a green mark on their tile. */
  finished?: Set<string>
  onOpen: (path: string) => void
  onPick: () => void
  onForget: (path: string) => void
  onNewWindow: () => void
}) {
  const { open, pinned, menu, wrap } = useHoverMenu()
  const [find, setFind] = useState('')
  const active = workspaces?.items.find((w) => w.path === workspaces.active)
  const items = workspaces?.items ?? []
  const shown = filterWorkspaces(items, find)

  const choose = (w: WorkspaceInfo) => {
    if (!w.exists) return
    menu.chosen()
    setFind('')
    if (w.path !== workspaces?.active) onOpen(w.path)
  }
  const buttonKeys = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) menu.click()
      requestAnimationFrame(() => wrap.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus())
    }
  }

  return (
    <div className="ws" ref={wrap as React.RefObject<HTMLDivElement>} onMouseEnter={() => menu.enter()} onMouseLeave={() => menu.leave()}>
      <button className={`ws-button ${open ? 'open' : ''}`} onClick={() => menu.click()} onKeyDown={buttonKeys} aria-haspopup="menu" aria-expanded={open} title={workspaces?.active ?? 'Choose a project folder'}>
        <span className="ws-name">{active?.name ?? (workspaces?.active ? workspaces.active.split(/[\\/]/).pop() : 'Choose a project')}</span>
        {active && <span className={`ws-tag ${active.git ? 'git' : ''}`}>{active.git ? 'git' : 'no git'}</span>}
        <span className="ws-caret" aria-hidden="true" />
        {dot && <span className="sr-only">{dot === 'need' ? ' Another project needs you' : ' An agent in another project finished'}</span>}
      </button>
      {dot && <span className={`adot ${dot}`} aria-hidden="true" data-testid="project-dot" />}
      {open && (
        <div className="qp-wrap" data-pinned={pinned}>
          {items.length > 0 ? (
            <QuickPanel
              label="Projects"
              title="Projects"
              count={items.length}
              {...(items.length > SEARCH_FROM && { search: find, onSearch: setFind, onSearchEnter: () => shown[0] && choose(shown[0]) })}
              footer={
                <>
                  <button role="menuitem" onClick={() => (menu.chosen(), onPick())}>Open another folder…</button>
                  <button role="menuitem" onClick={() => (menu.chosen(), onNewWindow())} title="Another window onto the same agents, to work in a different project">New window</button>
                  <span className="hint">⌘⇧[ ] to step</span>
                </>
              }
            >
              {shown.map((w, i) => {
                const a = activity[w.path]
                const sub = !w.exists ? 'folder is missing' : w.agents > 0 ? `${w.agents} agent${w.agents === 1 ? '' : 's'}` : 'no agents'
                return (
                  <div key={w.path} className={`wt-cell ${w.path === workspaces?.active ? 'on' : ''}`} data-reveal={w.exists ? w.path : undefined}>
                    <button role="menuitem" className={`wt ${w.path === workspaces?.active ? 'on' : ''} ${w.exists ? '' : 'miss'}`} data-n={i < 9 ? String(i + 1) : undefined} onClick={() => choose(w)} disabled={!w.exists} aria-current={w.path === workspaces?.active} title={w.exists ? w.path : `${w.path} (missing)`}>
                      {i < 9 && <kbd aria-hidden="true">{i + 1}</kbd>}
                      <span className="wt-top">
                        <Identicon name={w.name} />
                        {a && a.waiting > 0 && <span className="wt-need" title={`${a.waiting} waiting for you`}>{a.waiting}</span>}
                        {a && a.waiting === 0 && finished.has(w.path) && <span className="wt-done" title="An agent here finished" />}
                        {a && a.waiting === 0 && !finished.has(w.path) && a.working > 0 && <span className="wt-live" title={`${a.working} working`} />}
                      </span>
                      <span className="wt-name">{w.name}</span>
                      <span className="wt-sub">
                        {sub}
                        {w.exists && <em className={w.git ? 'git' : ''}>{w.git ? 'git' : 'no git'}</em>}
                      </span>
                    </button>
                    {w.saved && <button className="wt-x" onClick={() => onForget(w.path)} aria-label={`Forget ${w.name}`} title="Forget this project (nothing on disk is deleted)" />}
                  </div>
                )
              })}
              {shown.length === 0 && <p className="hint qp-none">No project matches.</p>}
            </QuickPanel>
          ) : (
            <div className="qp" role="menu" aria-label="Projects">
              <p className="hint qp-none">Projects you work in appear here.</p>
              <div className="qf">
                <button role="menuitem" onClick={() => (menu.chosen(), onPick())}>Open another folder…</button>
                <button role="menuitem" onClick={() => (menu.chosen(), onNewWindow())}>New window</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
