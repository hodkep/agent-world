import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { INBOX, subtasksOf, type MessageLink, type Todo, type TodoBoard } from '../../shared/todos'
import { LabelChip, LabelFilter } from './Labels'
import { useConfirm } from '../panel/ConfirmDialog'
import { TodoDetail, type AskAgent, type TodoRun } from './TodoDetail'
import { Modal } from '../panel/Modal'
import { TodoPad } from './TodoPad'
import { actorTag, agoLabel, autoClosed, filterBoard, listGroups, makers, pickList, pickRange, progressOf, splitList } from './todoView'

const clean = (e: unknown) => (e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))

function Who({ a }: { a: Todo['createdBy'] }) {
  const t = actorTag(a)
  return <span className="td-who"><i className={`td-dot ${t.tone}`} />{t.label}{t.forMain && <small className="td-for"> for {t.forMain}</small>}</span>
}

/** The todo board of the open project in a large window: every list side by side, the person's tasks and the agents' together. */
export function TodoBoardModal({ folder, agents, focusId, runsOf, onOpenRun, onClose, onOpenMessage, onAsk }: { folder: string; agents: AskAgent[]; focusId?: string | null; /** The workflow runs a task belongs to. */ runsOf?: (todoId: string) => TodoRun[]; onOpenRun?: (runId: string) => void; onClose: () => void; onOpenMessage: (link: MessageLink) => void; onAsk: (agentId: string, message: string, openChat: boolean) => Promise<void> }) {
  const [board, setBoard] = useState<TodoBoard>({ lists: [], todos: [], next: 1 })
  const [who, setWho] = useState('all')
  const [query, setQuery] = useState('')
  const [label, setLabel] = useState<string | undefined>(undefined)
  const [sel, setSel] = useState<string | null>(focusId ?? null)
  useEffect(() => { if (focusId) setSel(focusId) }, [focusId])
  const [folded, setFolded] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [newList, setNewList] = useState<string | null>(null)
  const [menu, setMenu] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{ from: string; to: string } | null>(null)
  const [error, setError] = useState('')
  const dragging = useRef<string | null>(null)
  // Which view the board is in: the lists, or the scratch pad. And the tasks picked for a bulk action, with the last one clicked (where a range starts).
  const [tab, setTab] = useState<'lists' | 'pad'>('lists')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const anchor = useRef<string | undefined>(undefined)
  const [moveMenu, setMoveMenu] = useState(false)
  const [moveTo, setMoveTo] = useState<string | null>(null)
  // Lists with something open come first and the rest are small tiles. Who is in which group is fixed when the window is opened or filtered, so a card does not move while it is being used.
  const [loaded, setLoaded] = useState(false)
  const [was, setWas] = useState<Map<string, boolean> | undefined>(undefined)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [ask, confirmNode] = useConfirm()

  const load = useCallback(() => void window.aw.todos.get(folder).then((r) => (setBoard(r.board), setLoaded(true)), (e) => setError(clean(e))), [folder])
  useEffect(() => {
    load()
    return window.aw.onTodosChanged(load)
  }, [load])
  const act = (p: Promise<unknown>) => void p.then(() => setError(''), (e) => setError(clean(e)))
  const fail = useCallback((e: unknown) => setError(clean(e)), [])
  // What was picked and is gone (removed, or by someone else) is let go of.
  useEffect(() => setPicked((p) => (p.size && [...p].some((id) => !board.todos.some((t) => t.id === id)) ? new Set([...p].filter((id) => board.todos.some((t) => t.id === id))) : p)), [board])
  // Esc lets go of the picked tasks first (and does not close the window); a second Esc closes it.
  useEffect(() => {
    if (!picked.size) return
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      setPicked(new Set())
      setMoveMenu(false)
    }
    document.addEventListener('keydown', esc, true)
    return () => document.removeEventListener('keydown', esc, true)
  }, [picked.size])
  const bulk = (op: Parameters<typeof window.aw.todos.bulk>[2]) => {
    const ids = [...picked]
    setPicked(new Set())
    setMoveMenu(false)
    setMoveTo(null)
    if (op.do === 'remove' && sel && ids.includes(sel)) setSel(null)
    act(window.aw.todos.bulk(folder, ids, op))
  }

  const shown = useMemo(() => filterBoard(board, { who, query, label }), [board, who, query, label])
  const names = useMemo(() => makers(board), [board])
  const unsorted = board.todos.filter((t) => t.auto && !t.named).length
  const [sorting, setSorting] = useState(false)
  const sortInbox = () => {
    setSorting(true)
    void window.aw.todos.tidyInbox(folder).then(() => setError(''), (e) => setError(clean(e))).finally(() => setSorting(false))
  }
  const open = board.todos.find((t) => t.id === sel) ?? null
  const needs = board.todos.filter((t) => t.needsYou && t.status !== 'done').length

  // The lists drawn (the Inbox only while it holds something), the number open in each, and which are active.
  const visible = shown.lists.filter((l) => l !== INBOX || board.todos.some((t) => t.list === INBOX))
  const openCounts = useMemo(() => Object.fromEntries(visible.map((l) => [l, shown.todos.filter((t) => t.list === l && !t.parent && t.status !== 'done').length])), [visible.join('|'), shown]) // eslint-disable-line react-hooks/exhaustive-deps
  const groups = listGroups(visible, openCounts, was)
  const ordered = [...groups.active, ...groups.quiet]
  useEffect(() => {
    if (loaded && tab === 'lists') setWas(new Map(visible.map((l) => [l, (openCounts[l] ?? 0) > 0])))
    setExpanded(new Set())
  }, [loaded, who, query, tab]) // eslint-disable-line react-hooks/exhaustive-deps
  // The order the tasks are drawn in, for a Shift-click range.
  const drawn = shown.lists.flatMap((l) => {
    const { open: o, done: dn } = splitList(shown, l)
    return [...o, ...(folded.has(l) ? dn : [])].map((t) => t.id)
  })
  const pick = (id: string, e: { shiftKey?: boolean }) => {
    // Read before it moves: the update below runs later, after the anchor is this task.
    const from = anchor.current
    setPicked((p) => {
      if (e.shiftKey && from !== undefined) return pickRange(drawn, from, id, p)
      const n = new Set(p)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
    anchor.current = id
  }
  const drop = (list: string, index: number) => {
    const id = dragging.current
    dragging.current = null
    if (id) act(window.aw.todos.move(folder, id, list, index))
  }
  const submitTask = (list: string) => {
    const title = draft.trim()
    setAdding(null)
    setDraft('')
    // A list that gets a task is active from now on.
    if (title) (setWas((w) => new Map(w).set(list, true)), act(window.aw.todos.add(folder, { title, list })))
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
          <button key={w} className="td-chip" aria-pressed={tab === 'lists' && who === w} onClick={() => (setWho(w), setTab('lists'))}>{w === 'all' ? 'Everyone' : w === 'you' ? 'Made by you' : `Made by ${w}`}</button>
        ))}
        <button className="td-chip" aria-pressed={tab === 'pad'} onClick={() => setTab('pad')}>Scratch pad</button>
        {tab === 'lists' && <LabelFilter board={board} folder={folder} active={label} onPick={setLabel} act={act} confirm={ask} />}
        {unsorted > 0 && tab === 'lists' && <button className="td-sort" onClick={sortInbox} disabled={sorting} title="A small model names each request-made task for what was done and puts it in a list by area; requests left open by agents that are not working are closed">{sorting ? 'Sorting…' : `Name and sort ${unsorted} task${unsorted === 1 ? '' : 's'}`}</button>}
        {tab === 'lists' && <input className="td-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search todos…" aria-label="Search todos" />}
      </div>
      {error && <p className="error td-error" role="alert">{error}</p>}
      {tab === 'pad' && <div className="td-wrap"><TodoPad folder={folder} lists={board.lists} onShowBoard={() => setTab('lists')} onError={fail} /></div>}
      {tab === 'lists' && <div className="td-wrap">
        <div className="td-board" role="list" aria-label="Todo lists">
          {ordered.map((list, index) => {
            const { open: openTodos, done } = splitList(shown, list)
            const divider = index === groups.active.length && groups.quiet.length > 0
            if (groups.quiet.includes(list) && !expanded.has(list)) {
              // A list with nothing open is a small tile; a click opens it (its finished tasks, a place to add one), and a task can be dropped on it.
              return (
                <Fragment key={list}>
                  {divider && <div className="td-sep" aria-hidden="true">Nothing open · {groups.quiet.length}</div>}
                  <section className="td-tile" role="listitem" aria-label={list} onDragOver={(e) => e.preventDefault()} onDrop={(e) => (e.preventDefault(), setWas((w) => new Map(w).set(list, true)), drop(list, 0))}>
                    <button onClick={() => setExpanded((x) => new Set(x).add(list))} aria-label={`Open ${list}`} aria-expanded="false"><b>{list}</b><span>{done.length ? `${done.length} done` : 'empty'}</span></button>
                  </section>
                </Fragment>
              )
            }
            const isFolded = !folded.has(list)
            const mine = openTodos.map((t) => t.id)
            const all = mine.length > 0 && mine.every((id) => picked.has(id))
            const some = mine.some((id) => picked.has(id))
            return (
              <Fragment key={list}>
              {divider && <div className="td-sep" aria-hidden="true">Nothing open · {groups.quiet.length}</div>}
              <section className="td-list" role="listitem" aria-label={list} onDragOver={(e) => e.preventDefault()} onDrop={(e) => (e.preventDefault(), drop(list, openTodos.length))}>
                <header className="td-lh">
                  {renaming?.from === list ? (
                    <input autoFocus value={renaming.to} aria-label={`Rename ${list}`} onChange={(e) => setRenaming({ from: list, to: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { act(window.aw.todos.renameList(folder, list, renaming.to)); setRenaming(null) } else if (e.key === 'Escape') setRenaming(null) }} onBlur={() => setRenaming(null)} />
                  ) : <b>{list}</b>}
                  {mine.length > 0 && <button className={`td-pickall${all ? ' on' : some ? ' some' : ''}${picked.size ? ' show' : ''}`} role="checkbox" aria-checked={all ? true : some ? 'mixed' : false} aria-label={`Select all in ${list}`} title={`Select all ${mine.length} open in ${list}`} onClick={() => setPicked(pickList(mine, picked))}>{all ? '✓' : some ? '–' : ''}</button>}
                  <span className="td-n">{openTodos.length} open</span>
                  <span className="td-menu">
                    <button className="td-more" aria-label={`Menu for ${list}`} aria-expanded={menu === list} onClick={() => setMenu(menu === list ? null : list)}>⋯</button>
                    {menu === list && (
                      <div className="td-pop" role="menu">
                        <button role="menuitem" onClick={() => (setRenaming({ from: list, to: list }), setMenu(null))}>Rename list</button>
                        <button role="menuitem" className="danger" onClick={() => { const n = board.todos.filter((t) => t.list === list).length; setMenu(null); if (n === 0) return act(window.aw.todos.removeList(folder, list)); void ask({ title: `Delete ${list} and its ${n} task${n === 1 ? '' : 's'}?`, body: 'This cannot be undone.', confirm: 'Delete list', danger: true }).then((yes) => yes && act(window.aw.todos.removeList(folder, list))) }}>Delete list</button>
                      </div>
                    )}
                  </span>
                </header>
                <div className="td-body">
                  {openTodos.map((t, i) => <TaskRow key={t.id} t={t} board={board} onOpen={setSel} act={act} folder={folder} picked={picked.has(t.id)} picking={picked.size > 0} onPick={(e) => pick(t.id, e)} selected={sel === t.id} onSelect={() => setSel(sel === t.id ? null : t.id)} onTick={() => act(window.aw.todos.done(folder, t.id))} onDragStart={() => (dragging.current = t.id)} onDropOn={() => drop(list, i)} />)}
                  {adding === list ? (
                    <input className="td-new" autoFocus value={draft} placeholder="Task title" aria-label={`New task in ${list}`} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submitTask(list); else if (e.key === 'Escape') (setAdding(null), setDraft('')) }} onBlur={() => submitTask(list)} />
                  ) : <button className="td-add" onClick={() => (setAdding(list), setDraft(''))}>＋ Add a task</button>}
                  {done.length > 0 && (
                    <>
                      <button className="td-done-h" aria-expanded={!isFolded} onClick={() => setFolded((f) => { const n = new Set(f); if (n.has(list)) n.delete(list); else n.add(list); return n })}>{isFolded ? '▸' : '▾'} Done ({done.length})</button>
                      {!isFolded && done.map((t) => <TaskRow key={t.id} t={t} board={board} onOpen={setSel} act={act} folder={folder} picked={picked.has(t.id)} picking={picked.size > 0} onPick={(e) => pick(t.id, e)} selected={sel === t.id} onSelect={() => setSel(sel === t.id ? null : t.id)} onTick={() => act(window.aw.todos.reopen(folder, t.id))} onDragStart={() => (dragging.current = t.id)} onDropOn={() => drop(list, openTodos.length)} />)}
                    </>
                  )}
                </div>
              </section>
              </Fragment>
            )
          })}
          {newList === null ? <button className="td-newlist" onClick={() => setNewList('')}>＋ New list</button> : (
            <input className="td-newlist" autoFocus value={newList} placeholder="List name" aria-label="New list name" onChange={(e) => setNewList(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { if (newList.trim()) (setWas((w) => new Map(w).set(newList.trim(), true)), act(window.aw.todos.addList(folder, newList))); setNewList(null) } else if (e.key === 'Escape') setNewList(null) }} onBlur={() => setNewList(null)} />
          )}
        </div>
        {open && <TodoDetail key={open.id} t={open} board={board} folder={folder} agents={agents} runs={runsOf?.(open.id)} onOpenRun={onOpenRun} onSelect={setSel} onClose={() => setSel(null)} act={act} onOpenMessage={onOpenMessage} onAsk={onAsk} confirm={ask} />}
        {picked.size > 0 && <BulkBar ids={[...picked]} board={board} lists={board.lists.filter((l) => l !== INBOX || board.todos.some((t) => t.list === INBOX))} menu={moveMenu} setMenu={setMoveMenu} moveTo={moveTo} setMoveTo={setMoveTo} onClear={() => setPicked(new Set())} onDo={bulk} confirm={ask} />}
      </div>}
      {confirmNode}
    </Modal>
  )
}

function TaskRow({ t, board, onOpen, act, folder, picked, picking, onPick, selected, onSelect, onTick, onDragStart, onDropOn }: { t: Todo; board: TodoBoard; onOpen: (id: string) => void; act: (p: Promise<unknown>) => void; folder: string; picked: boolean; picking: boolean; onPick: (e: { shiftKey?: boolean }) => void; selected: boolean; onSelect: () => void; onTick: () => void; onDragStart: () => void; onDropOn: () => void }) {
  const done = t.status === 'done'
  const parts = subtasksOf(board, t.id)
  const { done: partsDone, total } = progressOf(board, t.id)
  return (
    <div className={`td-task ${t.status}${t.needsYou && !done ? ' need' : ''}${selected ? ' sel' : ''}${picked ? ' picked' : ''}${picking ? ' picking' : ''}`} draggable onDragStart={onDragStart} onDragOver={(e) => e.preventDefault()} onDrop={(e) => (e.preventDefault(), e.stopPropagation(), onDropOn())}>
      <span className="td-stripe" aria-hidden="true" />
      <button className="td-pick" role="checkbox" aria-checked={picked} aria-label={`Select ${t.title}`} onClick={(e) => onPick(e)}>{picked ? '✓' : ''}</button>
      <button className="td-ck" role="checkbox" aria-checked={done} aria-label={`${done ? 'Reopen' : 'Finish'} ${t.title}`} onClick={onTick}>{done ? '✓' : ''}</button>
      <button className="td-main" onClick={(e) => (e.metaKey || e.ctrlKey || e.shiftKey ? onPick(e) : onSelect())} aria-label={`Open ${t.title}`} aria-expanded={selected}>
        <span className="td-title">{t.title}</span>
        <span className="td-sub">
          {done && autoClosed(t) && <span className="td-auto" title={autoClosed(t) === 'stopped' ? 'The app closed it when the board was opened: the agent had stopped and nobody said it was done' : 'The app closed it when the agent\'s turn ended: nobody said it was done'}>auto-closed</span>}
          {done && !autoClosed(t) && t.doneBy && <span className="td-st done">done by {t.doneBy.name}</span>}
          {t.needsYou && !done && <span className="td-flag">needs you</span>}
          {t.status === 'doing' && <span className="td-st doing">doing{t.claimedBy ? ` · ${t.claimedBy.name}` : ''}</span>}
          {t.status === 'blocked' && <span className="td-st blocked">blocked</span>}
          {t.stale && <span className="td-st blocked" title="The agent's turn ended and it never marked this done or blocked">unfinished</span>}
          <Who a={t.createdBy} />
          <span>created {agoLabel(t.createdAt)}</span>
          {t.updatedAt !== t.createdAt && <span>updated {t.updatedBy.name} {agoLabel(t.updatedAt)}</span>}
        </span>
        {t.labels && t.labels.length > 0 && <span className="lbls">{t.labels.map((n) => <LabelChip key={n} name={n} color={board.labels?.find((l) => l.name === n)?.color ?? '#6ad0e0'} />)}</span>}
      </button>
      {parts.length > 0 && (
        <div className="td-checklist" aria-label={`Subtasks of ${t.title}`}>
          <div className="td-prog" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={partsDone} aria-label={`${partsDone} of ${total} subtasks done`}><u style={{ width: `${(partsDone / total) * 100}%` }} /></div>
          <small>{partsDone} of {total} done</small>
          {parts.map((x) => (
            <div key={x.id} className={`td-subrow ${x.status}`}>
              <button className="td-ck" role="checkbox" aria-checked={x.status === 'done'} aria-label={`${x.status === 'done' ? 'Reopen' : 'Finish'} ${x.title}`} onClick={() => act(x.status === 'done' ? window.aw.todos.reopen(folder, x.id) : window.aw.todos.done(folder, x.id))}>{x.status === 'done' ? '✓' : ''}</button>
              <button className="td-subtitle" onClick={() => onOpen(x.id)} aria-label={`Open ${x.title}`}>{x.title}</button>
              <small>#{x.id}</small>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** What can be done to the picked tasks: finish, reopen, move, flag, delete, or let go. */
function BulkBar({ ids, board, lists, menu, setMenu, moveTo, setMoveTo, onClear, onDo, confirm }: {
  ids: string[]
  board: TodoBoard
  lists: string[]
  menu: boolean
  setMenu: (m: boolean) => void
  moveTo: string | null
  setMoveTo: (v: string | null) => void
  onClear: () => void
  onDo: (op: Parameters<typeof window.aw.todos.bulk>[2]) => void
  confirm: ReturnType<typeof useConfirm>[0]
}) {
  const here = board.todos.filter((t) => ids.includes(t.id))
  const anyOpen = here.some((t) => t.status !== 'done')
  const anyDone = here.some((t) => t.status === 'done')
  const allNeed = here.every((t) => t.needsYou)
  const n = here.length
  return (
    <div className="td-bulk" role="toolbar" aria-label="Selected tasks">
      <b>{n} selected</b>
      {anyOpen && <button className="primary" onClick={() => onDo({ do: 'done' })}>Mark done</button>}
      {anyDone && <button onClick={() => onDo({ do: 'reopen' })}>Reopen</button>}
      <span className="td-menu">
        <button aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>Move to ▾</button>
        {menu && (
          <div className="td-pop up" role="menu" aria-label="Move the selected tasks to">
            {lists.map((l) => <button key={l} role="menuitem" onClick={() => onDo({ do: 'move', list: l })}>{l}</button>)}
            {moveTo === null ? <button role="menuitem" onClick={() => setMoveTo('')}>New list…</button> : (
              <input autoFocus value={moveTo} placeholder="List name" aria-label="New list name for the selected tasks" onChange={(e) => setMoveTo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && moveTo.trim()) onDo({ do: 'move', list: moveTo.trim() }); else if (e.key === 'Escape') (e.stopPropagation(), setMoveTo(null)) }} />
            )}
          </div>
        )}
      </span>
      <button onClick={() => onDo({ do: 'needsYou', on: !allNeed })}>{allNeed ? 'Needs you off' : 'Needs you'}</button>
      <button className="danger" onClick={() => void confirm({ title: `Delete ${n} task${n === 1 ? '' : 's'}?`, body: 'They are deleted for you and for the agents. This cannot be undone.', confirm: `Delete ${n}`, danger: true }).then((yes) => yes && onDo({ do: 'remove' }))}>Delete</button>
      <span className="td-bulk-sp" />
      <button onClick={onClear}>Clear <kbd>Esc</kbd></button>
    </div>
  )
}
