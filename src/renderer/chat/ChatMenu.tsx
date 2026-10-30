import { useEffect, useRef, useState } from 'react'
import type { RemoteState } from '../../shared/types'
import { OutlineIcon } from '../panel/IconButton'
import { keysOf } from '../shortcuts'
import { LookRows } from './layoutUi'
import { RemoteRows } from './RemoteControl'
import { askRemote } from './remoteCommands'

/** The conversation's less common tools, folded into one button so they do not take a row: search, notes, export, the app's look and remote control, in groups. */
export function ChatMenu({ agentId, remote, markdown, onSearch }: { agentId: string; /** Absent for a program that cannot be continued from a phone. */ remote?: RemoteState; markdown: () => string; onSearch: () => void }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const wrap = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), setOpen(false))
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', esc, true)
    return () => {
      window.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', esc, true)
    }
  }, [open])
  const flash = (text: string) => (setNote(text), setTimeout(() => setNote(''), 2500))
  return (
    <span className="chat-menu menu-wrap" ref={wrap}>
      {note && <span className="chat-note" role="status">{note}</span>}
      <button className="icon-btn" aria-haspopup="menu" aria-expanded={open} aria-label="Conversation tools" title="Search, save notes, copy" onClick={() => setOpen((o) => !o)}>
        ⋯
      </button>
      {open && (
        <div className="pop-menu right chat-pop" role="menu" aria-label="Conversation tools">
          <div className="menu-label">Conversation</div>
          <button role="menuitem" title="Find in the conversation" onClick={() => (setOpen(false), onSearch())}>
            <span className="l">
              <OutlineIcon name="search" size={14} />
              Search
            </span>
            <kbd>{keysOf('chat-find')}</kbd>
          </button>
          <button
            role="menuitem"
            onClick={() =>
              void window.aw.saveNotes(agentId).then(
                () => (setOpen(false), flash('Notes saved')),
                () => (setOpen(false), flash('Nothing to save yet'))
              )
            }
          >
            <span className="l">
              <OutlineIcon name="notes" size={14} />
              <span className="mi-text">
                Save notes
                <small>A short record, to the notes folder</small>
              </span>
            </span>
          </button>
          <button role="menuitem" onClick={() => void navigator.clipboard.writeText(markdown()).then(() => (setOpen(false), flash('Copied')))}>
            <span className="l">
              <OutlineIcon name="copy" size={14} />
              Copy as Markdown
            </span>
          </button>
          <div className="menu-sep" />
          <div className="menu-label">Look of the app</div>
          <LookRows close={() => setOpen(false)} />
          {remote && (
            <>
              <div className="menu-sep" />
              <div className="menu-label">Remote</div>
              <RemoteRows state={remote} onToggle={() => askRemote(agentId, remote.state === 'off' ? 'on' : 'off')} onCopy={() => askRemote(agentId, 'link')} onQr={() => askRemote(agentId, 'qr')} close={() => setOpen(false)} />
            </>
          )}
        </div>
      )}
    </span>
  )
}
