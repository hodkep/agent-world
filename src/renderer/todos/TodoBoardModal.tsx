import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MessageLink, Todo, TodoBoard } from '../../shared/todos'
import { Modal } from '../panel/Modal'
import { actorTag, agoLabel, filterBoard, makers, splitList } from './todoView'

const clean = (e: unknown) => (e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))

function Who({ a }: { a: Todo['createdBy'] }) {
  const t = actorTag(a)
  return <span className="td-who"><i className={`td-dot ${t.tone}`} />{t.label}</span>
}

/** The todo board of the open project in a large window: every list side by side, the person's tasks and the agents' together. */
export function TodoBoardModal({ folder, onClose, onOpenMessage }: { folder: string; onClose: () => void; onOpenMessage: (link: MessageLink) => void }) {
  const [board, setBoard] = useState<TodoBoard>({ lists: [], todos: [], next: 1 })
  const [who, setWho] = useState('all')
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  const [folded, setFolded] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [newList, setNewList] = useState<string | null>(null)
  const [menu, setMenu] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{ from: string; to: string } | null>(null)
  const [error, setError] = useState('')
  const dragging = useRef<string | null>(null)

  const load = useCallback(() => void window.aw.todos.get(folder).then((r) => setBoard(r.board), (e) => setError(clean(e))), [folder])
  useEffect(() => {
    load()
    return window.aw.onTodosChanged(load)
  }, [load])
  const act = (p: Promise<unknown>) => void p.then(() => setError(''), (e) => setError(clean(e)))

  const shown = useMemo(() => filterBoard(board, { who, query }), [board, who, query])
  const names = useMemo(() => makers(board), [board])
  const open = board.todos.find((t) => t.id === sel) ?? null
  const needs = board.todos.filter((t) => t.needsYou && t.status !== 'done').length

  const drop = (list: string, index: number) => {
    const id = dragging.current
    dragging.current = null
    if (id) act(window.aw.todos.move(folder, id, list, index))
  }
  const submitTask = (list: string) => {
    const title = draft.trim()
    setAdding(null)
    setDraft('')
    if (title) act(window.aw.todos.add(folder, { title, list }))
  }

  return (
    <Modal label="Todos" className="library-modal td-modal" onClose={onClose}>
      <header className="settings-head">
        <b>Todos</b>
        <small className="lib-lead">What needs doing in this project, added by you and by agents.{needs > 0 ? ` ${needs} need${needs === 1 ? 's' : ''} you.` : ''}</small>
        <button onClick={onClose} aria-label="Close todos">Close</button>
      </header>
      <div className="td-bar" role="group" aria-label="Filter todos">
        {['all', 'you', ...names].map((w) => (
          <button key={w} className="td-chip" aria-pressed={who === w} onClick={() => setWho(w)}>{w === 'all' ? 'Everyone' : w === 'you' ? 'Made by you' : `Made by ${w}`}</button>
        ))}
        <input className="td-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search todos…" aria-label="Search todos" />
      </div>
      {error && <p className="error td-error" role="alert">{error}</p>}
      <div className="td-wrap">
        <div className="td-board" role="list" aria-label="Todo lists">
          {shown.lists.map((list) => {
            const { open: openTodos, done } = splitList(shown, list)
            const isFolded = !folded.has(list)
            return (
              <section key={list} className="td-list" role="listitem" aria-label={list} onDragOver={(e) => e.preventDefault()} onDrop={(e) => (e.preventDefault(), drop(list, openTodos.length))}>
                <header className="td-lh">
                  {renaming?.from === list ? (
                    <input autoFocus value={renaming.to} aria-label={`Rename ${list}`} onChange={(e) => setRenaming({ from: list, to: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { act(window.aw.todos.renameList(folder, list, renaming.to)); setRenaming(null) } else if (e.key === 'Escape') setRenaming(null) }} onBlur={() => setRenaming(null)} />
                  ) : <b>{list}</b>}
                  <span className="td-n">{openTodos.length} open</span>
                  <span className="td-menu">
                    <button className="td-more" aria-label={`Menu for ${list}`} aria-expanded={menu === list} onClick={() => setMenu(menu === list ? null : list)}>⋯</button>
                    {menu === list && (
                      <div className="td-pop" role="menu">
                        <button role="menuitem" onClick={() => (setRenaming({ from: list, to: list }), setMenu(null))}>Rename list</button>
                        <button role="menuitem" className="danger" onClick={() => { const n = board.todos.filter((t) => t.list === list).length; setMenu(null); if (n === 0 || window.confirm(`Delete ${list} and its ${n} task${n === 1 ? '' : 's'}?`)) act(window.aw.todos.removeList(folder, list)) }}>Delete list</button>
                      </div>
                    )}
                  </span>
                </header>
                <div className="td-body">
                  {openTodos.map((t, i) => <TaskRow key={t.id} t={t} selected={sel === t.id} onSelect={() => setSel(sel === t.id ? null : t.id)} onTick={() => act(window.aw.todos.done(folder, t.id))} onDragStart={() => (dragging.current = t.id)} onDropOn={() => drop(list, i)} />)}
                  {adding === list ? (
                    <input className="td-new" autoFocus value={draft} placeholder="Task title" aria-label={`New task in ${list}`} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submitTask(list); else if (e.key === 'Escape') (setAdding(null), setDraft('')) }} onBlur={() => submitTask(list)} />
                  ) : <button className="td-add" onClick={() => (setAdding(list), setDraft(''))}>＋ Add a task</button>}
                  {done.length > 0 && (
                    <>
                      <button className="td-done-h" aria-expanded={!isFolded} onClick={() => setFolded((f) => { const n = new Set(f); if (n.has(list)) n.delete(list); else n.add(list); return n })}>{isFolded ? '▸' : '▾'} Done ({done.length})</button>
                      {!isFolded && done.map((t) => <TaskRow key={t.id} t={t} selected={sel === t.id} onSelect={() => setSel(sel === t.id ? null : t.id)} onTick={() => act(window.aw.todos.reopen(folder, t.id))} onDragStart={() => (dragging.current = t.id)} onDropOn={() => drop(list, openTodos.length)} />)}
                    </>
                  )}
                </div>
              </section>
            )
          })}
          {newList === null ? <button className="td-newlist" onClick={() => setNewList('')}>＋ New list</button> : (
            <input className="td-newlist" autoFocus value={newList} placeholder="List name" aria-label="New list name" onChange={(e) => setNewList(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { if (newList.trim()) act(window.aw.todos.addList(folder, newList)); setNewList(null) } else if (e.key === 'Escape') setNewList(null) }} onBlur={() => setNewList(null)} />
          )}
        </div>
        {open && <Detail key={open.id} t={open} folder={folder} onClose={() => setSel(null)} act={act} onOpenMessage={onOpenMessage} />}
      </div>
    </Modal>
  )
}

function TaskRow({ t, selected, onSelect, onTick, onDragStart, onDropOn }: { t: Todo; selected: boolean; onSelect: () => void; onTick: () => void; onDragStart: () => void; onDropOn: () => void }) {
  const done = t.status === 'done'
  return (
    <div className={`td-task${done ? ' done' : ''}${selected ? ' sel' : ''}`} draggable onDragStart={onDragStart} onDragOver={(e) => e.preventDefault()} onDrop={(e) => (e.preventDefault(), e.stopPropagation(), onDropOn())}>
      <button className="td-ck" role="checkbox" aria-checked={done} aria-label={`${done ? 'Reopen' : 'Finish'} ${t.title}`} onClick={onTick}>{done ? '✓' : ''}</button>
      <button className="td-main" onClick={onSelect} aria-label={`Open ${t.title}`} aria-expanded={selected}>
        <span className="td-title">{t.title}</span>
        <span className="td-sub">
          {t.needsYou && !done && <span className="td-flag">needs you</span>}
          {t.status === 'doing' && <span className="td-st doing">doing{t.claimedBy ? ` · ${t.claimedBy.name}` : ''}</span>}
          {t.status === 'blocked' && <span className="td-st blocked">blocked</span>}
          {t.stale && <span className="td-st blocked" title="The agent's turn ended and it never marked this done or blocked">unfinished</span>}
          <Who a={t.createdBy} />
          <span>created {agoLabel(t.createdAt)}</span>
          {t.updatedAt !== t.createdAt && <span>updated {t.updatedBy.name} {agoLabel(t.updatedAt)}</span>}
        </span>
      </button>
    </div>
  )
}

function Detail({ t, folder, onClose, act, onOpenMessage }: { t: Todo; folder: string; onClose: () => void; act: (p: Promise<unknown>) => void; onOpenMessage: (l: MessageLink) => void }) {
  const [title, setTitle] = useState(t.title)
  const [notes, setNotes] = useState(t.notes)
  const done = t.status === 'done'
  const link = done ? t.doneLink : t.createdLink
  return (
    <aside className="td-detail" aria-label="Task detail">
      <button className="td-x" onClick={onClose} aria-label="Close detail">×</button>
      <input className="td-dtitle" value={title} aria-label="Task title" onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() && title !== t.title && act(window.aw.todos.update(folder, t.id, { title }))} />
      <dl className="td-kv">
        <dt>List</dt><dd>{t.list}</dd>
        <dt>Status</dt><dd>{t.status}{t.blockedWhy ? `: ${t.blockedWhy}` : ''}{t.claimedBy ? ` · ${t.claimedBy.name}` : ''}{t.stale ? ' · its turn ended without saying done or blocked' : ''}{t.auto ? ' · made from your message' : ''}</dd>
        <dt>Created</dt><dd><Who a={t.createdBy} /> · {agoLabel(t.createdAt)}</dd>
        <dt>Updated</dt><dd><Who a={t.updatedBy} /> · {agoLabel(t.updatedAt)}</dd>
        {done && t.doneBy && <><dt>Done by</dt><dd><Who a={t.doneBy} /> · {agoLabel(t.doneAt ?? t.updatedAt)}</dd></>}
      </dl>
      <label className="td-check"><input type="checkbox" checked={t.needsYou} onChange={(e) => act(window.aw.todos.update(folder, t.id, { needsYou: e.target.checked }))} /> Needs you (a step only a person can do)</label>
      <textarea className="td-notes" rows={4} value={notes} placeholder="Notes" aria-label="Task notes" onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== t.notes && act(window.aw.todos.update(folder, t.id, { notes }))} />
      {done && t.doneNote && <blockquote className="td-quote"><b>{t.doneNote}</b></blockquote>}
      {link && (
        <div className="td-link">
          {link.excerpt && <blockquote className="td-quote"><i>“{link.excerpt}”</i></blockquote>}
          <button className="primary" onClick={() => onOpenMessage(link)}>{done ? 'Open the message it was finished in' : 'Open the message it was made in'} ↗</button>
        </div>
      )}
      <div className="su-row">
        <button className="primary" onClick={() => act(done ? window.aw.todos.reopen(folder, t.id) : window.aw.todos.done(folder, t.id))}>{done ? 'Reopen' : 'Mark done'}</button>
        <button className="danger" onClick={() => { if (window.confirm(`Remove “${t.title}”?`)) { act(window.aw.todos.remove(folder, t.id)); onClose() } }}>Remove</button>
      </div>
      <h4>History</h4>
      <ul className="td-hist" aria-label="History">
        {[...t.history].reverse().map((e, i) => <li key={i}><b>{e.what}</b> by <Who a={e.by} /> · {agoLabel(e.at)}{e.note ? ` (${e.note})` : ''}</li>)}
      </ul>
    </aside>
  )
}
