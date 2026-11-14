import { useEffect, useRef, useState } from 'react'
import type { TidyPlan } from '../../shared/todoCleanup'
import { Modal } from '../panel/Modal'

type Done = { removed: number; nested: number; labelled: number; moved: number; backup: string }
type State = { k: 'working'; done: number; total: number } | { k: 'preview'; plan: TidyPlan } | { k: 'applying'; plan: TidyPlan } | { k: 'done'; r: Done; undone?: boolean } | { k: 'error'; why: string }

const clean = (e: unknown) => (e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))
const EXAMPLES = 5
const ago = (path: string) => path.split('/').pop() ?? path

/** One group of the preview: what it does, how many tasks, and a few of them. */
function Group({ tone, glyph, title, hint, items }: { tone: string; glyph: string; title: string; hint: string; items: { key: string; text: string }[] }) {
  return (
    <section className="tidy-group" aria-label={title}>
      <div className="tidy-top">
        <i className={`tidy-tile ${tone}`} aria-hidden="true">{glyph}</i>
        <div className="tidy-t"><b>{title}</b><small>{hint}</small></div>
        <span className="n">{items.length}</span>
      </div>
      {items.length > 0 && (
        <details className="tidy-more">
          <summary>Show examples</summary>
          <ul>{items.slice(0, EXAMPLES).map((i) => <li key={i.key}><span className="id">#{i.key}</span><span>{i.text}</span></li>)}{items.length > EXAMPLES && <li className="more">and {items.length - EXAMPLES} more</li>}</ul>
        </details>
      )}
    </section>
  )
}

/** The tidy of the board: it reads the titles, shows what it would do in four groups, and does all of it when asked; one Undo puts the board back. */
export function TidyDialog({ folder, onClose }: { folder: string; onClose: () => void }) {
  const [s, setS] = useState<State>({ k: 'working', done: 0, total: 0 })
  const gone = useRef(false)
  // Whether the titles are still being read: closing then stops it, so the rest of the board is not read for nothing.
  const reading = useRef(true)
  useEffect(() => {
    gone.current = false
    reading.current = true
    const off = window.aw.onTidyProgress((p) => !gone.current && p.folder === folder && setS((x) => (x.k === 'working' ? { k: 'working', done: p.done, total: p.total } : x)))
    window.aw.todos.tidyPlan(folder).then(
      (plan) => ((reading.current = false), !gone.current && setS({ k: 'preview', plan })),
      (e) => ((reading.current = false), !gone.current && setS({ k: 'error', why: clean(e) }))
    )
    return () => {
      gone.current = true
      off()
      if (reading.current) void window.aw.todos.tidyCancel(folder)
    }
  }, [folder])

  const apply = (plan: TidyPlan) => {
    setS({ k: 'applying', plan })
    window.aw.todos.tidyApply(folder, plan).then((r) => setS({ k: 'done', r }), (e) => setS({ k: 'error', why: clean(e) }))
  }
  const undo = () => window.aw.todos.tidyUndo(folder).then(() => setS((x) => (x.k === 'done' ? { ...x, undone: true } : x)), (e) => setS({ k: 'error', why: clean(e) }))

  const empty = (p: TidyPlan) => !p.remove.length && !p.nest.length && !p.label.length && !p.move.length
  return (
    <Modal label="Tidy the board" className="tidy-dialog" onClose={onClose}>
      <div className="tidy">
        <header className="tidy-head"><b>Tidy the board</b>{s.k === 'preview' && <span className="m">{s.plan.read.toLocaleString('en-US')} todos read</span>}</header>
        {s.k === 'working' && (
          <div className="tidy-body" role="status">
            <div className="tidy-bar"><i style={{ width: s.total ? `${Math.round((s.done / s.total) * 100)}%` : '0%' }} /></div>
            <p className="m">{s.total ? `Reading titles ${s.done} of ${s.total}.` : 'Reading titles…'} Nothing has been changed.</p>
          </div>
        )}
        {(s.k === 'preview' || s.k === 'applying') && (empty(s.plan) ? <div className="tidy-body"><p>Nothing to tidy: no message the app wrote, no repeated work, no task without a kind.</p></div> : (
          <div className="tidy-body">
            <Group tone="rm" glyph="✕" title="Remove echoes and chores" hint="Messages the app wrote and chores, not work" items={s.plan.remove.map((r) => ({ key: r.id, text: r.title }))} />
            <Group tone="nest" glyph="↳" title="Nest the same work under one parent" hint={`${new Set(s.plan.nest.map((n) => n.parent)).size} parents`} items={s.plan.nest.map((n) => ({ key: n.id, text: `${n.title}: under ${n.parentTitle}` }))} />
            <Group tone="lab" glyph="#" title="Label each task with its kind" hint="feature, bug, research, design, test, release" items={s.plan.label.map((l) => ({ key: l.id, text: `${l.title}: ${l.label}` }))} />
            <Group tone="mv" glyph="→" title="Move out of one-off lists" hint="Lists with fewer than five tasks that are not an area" items={s.plan.move.map((m) => ({ key: m.id, text: `${m.title}: ${m.from} → ${m.to}` }))} />
            <p className="tidy-note">Your own hand-written todos and anything an agent is working on now are left alone. A copy of the board is made first.</p>
          </div>
        ))}
        {s.k === 'done' && (
          <div className="tidy-body" role="status">
            {s.undone ? <p><b>Undone.</b> The board is as it was before the tidy.</p> : (
              <p><b>Tidied.</b> Removed {s.r.removed}, nested {s.r.nested}, labelled {s.r.labelled}, moved {s.r.moved}. The old board is kept as <code>{ago(s.r.backup)}</code>.</p>
            )}
          </div>
        )}
        {s.k === 'error' && <div className="tidy-body"><p className="error" role="alert">{s.why}</p></div>}
        <footer className="tidy-foot">
          {(s.k === 'preview' || s.k === 'applying') && !empty(s.plan) && <span className="sum">Apply will remove {s.plan.remove.length}, nest {s.plan.nest.length}, label {s.plan.label.length}, move {s.plan.move.length}.</span>}
          {s.k === 'done' && !s.undone && <button onClick={() => void undo()}>Undo</button>}
          <button onClick={onClose}>{s.k === 'done' || s.k === 'error' || (s.k === 'preview' && empty(s.plan)) ? 'Close' : 'Cancel'}</button>
          {(s.k === 'preview' || s.k === 'applying') && !empty(s.plan) && <button className="go" disabled={s.k === 'applying'} onClick={() => apply(s.plan)}>Apply</button>}
        </footer>
      </div>
    </Modal>
  )
}
