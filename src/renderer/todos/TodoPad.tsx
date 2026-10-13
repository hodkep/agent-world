import { useCallback, useEffect, useRef, useState } from 'react'
import { padFromRows, padRows, type PadRow } from '../../shared/todoPad'
import { INBOX } from '../../shared/todos'

interface Row extends PadRow {
  id: number
}
let seq = 0
const blank = (): Row => ({ id: ++seq, title: '', done: false })
const withBlank = (rows: Row[]): Row[] => (rows.at(-1)?.title.trim() ?? '.') === '' ? rows : [...rows, blank()]
// What a pasted line starts with when it was a bullet or a checklist item somewhere else.
const BULLET = /^\s*(?:[-*+]\s+(?:\[[ xX]\]\s*)?)?/

/** The scratch pad: a checklist where each line is a task. Type one and press Enter for the next; each row says which list it will go to. Saved as you type; "Make" turns the rows into tasks and clears them. */
export function TodoPad({ folder, lists, onShowBoard, onError }: { folder: string; lists: string[]; onShowBoard: () => void; onError: (e: unknown) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [status, setStatus] = useState('')
  const [menu, setMenu] = useState<number | null>(null)
  const [newList, setNewList] = useState<string | null>(null)
  const [focusId, setFocusId] = useState<number | null>(null)
  const inputs = useRef(new Map<number, HTMLInputElement>())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef('')
  const listsRef = useRef(lists)
  listsRef.current = lists

  const read = useCallback(
    (text: string) => {
      latest.current = text
      setRows(withBlank(padRows(text, listsRef.current).map((r) => ({ ...r, id: ++seq }))))
    },
    []
  )
  useEffect(() => {
    let alive = true
    void window.aw.todos.padGet(folder).then((t) => alive && read(t), onError)
    return () => {
      alive = false
      // What was typed last is saved when the pad is left.
      if (timer.current) (clearTimeout(timer.current), void window.aw.todos.padSet(folder, latest.current))
    }
  }, [folder, onError, read])
  useEffect(() => {
    if (focusId === null) return
    inputs.current.get(focusId)?.focus()
    setFocusId(null)
  }, [focusId, rows])

  const update = (next: Row[]) => {
    const full = withBlank(next)
    setRows(full)
    const text = padFromRows(full)
    latest.current = text
    setStatus('')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => ((timer.current = null), void window.aw.todos.padSet(folder, text).catch(onError)), 400)
  }
  const flush = async () => {
    if (timer.current) (clearTimeout(timer.current), (timer.current = null))
    await window.aw.todos.padSet(folder, latest.current)
  }
  const patch = (id: number, p: Partial<PadRow>) => update((rows ?? []).map((r) => (r.id === id ? { ...r, ...p } : r)))
  const insertAfter = (id: number, titles: string[]) => {
    const list = rows ?? []
    const at = list.findIndex((r) => r.id === id)
    const made = titles.map((title) => ({ ...blank(), title }))
    update([...list.slice(0, at + 1), ...made, ...list.slice(at + 1)])
    return made
  }
  const count = (rows ?? []).filter((r) => r.title.trim()).length

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, r: Row, i: number) => {
    const all = rows ?? []
    if (e.key === 'Enter') {
      e.preventDefault()
      if (!r.title.trim()) return
      const next = all[i + 1]
      if (next && !next.title.trim()) setFocusId(next.id)
      else setFocusId(insertAfter(r.id, [''])[0]!.id)
    } else if (e.key === 'Backspace' && !r.title && all.length > 1) {
      e.preventDefault()
      const to = all[i - 1] ?? all[i + 1]
      update(all.filter((x) => x.id !== r.id))
      if (to) setFocusId(to.id)
    } else if (e.key === 'ArrowDown' && all[i + 1]) setFocusId(all[i + 1]!.id)
    else if (e.key === 'ArrowUp' && all[i - 1]) setFocusId(all[i - 1]!.id)
  }
  // Several lines pasted at once are several tasks.
  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>, r: Row) => {
    const text = e.clipboardData.getData('text')
    if (!text.includes('\n')) return
    e.preventDefault()
    const lines = text.split('\n').map((l) => l.replace(BULLET, '').trim()).filter(Boolean)
    if (!lines.length) return
    const [first, ...rest] = lines
    const list = rows ?? []
    const at = list.findIndex((x) => x.id === r.id)
    const made = rest.map((title) => ({ ...blank(), title }))
    update([...list.slice(0, at), { ...r, title: r.title ? `${r.title} ${first}` : first! }, ...made, ...list.slice(at + 1)])
    setFocusId((made.at(-1) ?? r).id)
  }

  const make = () =>
    void flush()
      .then(() => window.aw.todos.padMake(folder))
      .then(async (n) => {
        read(await window.aw.todos.padGet(folder))
        setStatus(`Made ${n} task${n === 1 ? '' : 's'}. They are on the board.`)
      })
      .catch(onError)
  const undo = () =>
    void flush()
      .then(() => window.aw.todos.padUndo(folder))
      .then(async (n) => {
        read(await window.aw.todos.padGet(folder))
        setStatus(n ? `Took back ${n} task${n === 1 ? '' : 's'}; they are in the pad again.` : 'Nothing to take back (a task someone started on stays).')
      })
      .catch(onError)
  const pickList = (id: number, list: string | undefined) => {
    patch(id, { list })
    setMenu(null)
    setNewList(null)
  }
  const choices = [INBOX, ...lists.filter((l) => l !== INBOX)]

  return (
    <section className="td-pad" aria-label="Scratch pad">
      <ul className="td-pad-rows" aria-label="Pad tasks">
        {(rows ?? []).map((r, i, all) => {
          const isNew = i === all.length - 1 && !r.title
          return (
            <li key={r.id} className={`td-pad-row${r.done ? ' done' : ''}${isNew ? ' new' : ''}`}>
              <button className={`td-pad-ck${r.done ? ' on' : ''}`} role="checkbox" aria-checked={r.done} aria-label={r.title ? `Finished: ${r.title}` : 'Finished'} disabled={isNew} onClick={() => patch(r.id, { done: !r.done })}>{r.done ? '✓' : ''}</button>
              <input
                ref={(el) => void (el ? inputs.current.set(r.id, el) : inputs.current.delete(r.id))}
                value={r.title}
                placeholder={isNew ? 'Type a task, then Enter' : ''}
                aria-label={isNew ? 'New pad task' : `Pad task ${i + 1}`}
                spellCheck={false}
                onChange={(e) => patch(r.id, { title: e.target.value.replace(/\n/g, ' ') })}
                onKeyDown={(e) => onKeyDown(e, r, i)}
                onPaste={(e) => onPaste(e, r)}
              />
              {!isNew && (
                <span className="td-menu">
                  <button className={`td-pad-chip${r.list ? '' : ' none'}`} aria-haspopup="menu" aria-expanded={menu === r.id} aria-label={`List for ${r.title}: ${r.list ?? INBOX}`} onClick={() => (setMenu(menu === r.id ? null : r.id), setNewList(null))}>{r.list ?? INBOX} ▾</button>
                  {menu === r.id && (
                    <div className="td-pop" role="menu" aria-label={`Lists for ${r.title}`}>
                      {choices.map((l) => <button key={l} role="menuitem" onClick={() => pickList(r.id, l === INBOX ? undefined : l)}>{l}</button>)}
                      {newList === null ? <button role="menuitem" onClick={() => setNewList('')}>New list…</button> : (
                        <input autoFocus value={newList} placeholder="List name" aria-label="New list name for this task" onChange={(e) => setNewList(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && newList.trim()) pickList(r.id, newList.trim()); else if (e.key === 'Escape') (e.stopPropagation(), setNewList(null)) }} />
                      )}
                    </div>
                  )}
                </span>
              )}
              {!isNew && <button className="td-pad-x" aria-label={`Remove ${r.title}`} onClick={() => update(all.filter((x) => x.id !== r.id))}>×</button>}
            </li>
          )
        })}
      </ul>
      <div className="td-pad-foot">
        <button className="primary" disabled={count === 0} onClick={make}>{count === 1 ? 'Make 1 task' : `Make ${count} tasks`}</button>
        <button onClick={undo}>Undo last</button>
        {status && <><span className="hint" role="status">{status}</span><button className="td-link-btn" onClick={onShowBoard}>Show the board</button></>}
        <span className="hint td-pad-keys">Enter adds a row · Backspace on an empty row removes it · paste many lines at once</span>
      </div>
    </section>
  )
}
