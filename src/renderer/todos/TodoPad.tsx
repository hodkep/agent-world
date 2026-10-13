import { useEffect, useMemo, useRef, useState } from 'react'
import { padPlan } from '../../shared/todoPad'
import { INBOX } from '../../shared/todos'

const PLACEHOLDER = '- [ ] a task\n  its notes, indented\n\n## Chat\n- [ ] a task for the Chat list\n- [x] one that is already done'

/** The scratch pad: markdown the person jots tasks in, saved as they type, with a preview of what the button will make before it makes it. */
export function TodoPad({ folder, lists, onShowBoard, onError }: { folder: string; lists: string[]; onShowBoard: () => void; onError: (e: unknown) => void }) {
  const [text, setText] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef('')
  useEffect(() => {
    let alive = true
    void window.aw.todos.padGet(folder).then((t) => alive && (setText(t), (latest.current = t)), onError)
    return () => {
      alive = false
      // What was typed last is saved when the pad is left.
      if (timer.current) (clearTimeout(timer.current), void window.aw.todos.padSet(folder, latest.current))
    }
  }, [folder, onError])
  const change = (t: string) => {
    setText(t)
    latest.current = t
    setStatus('')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => ((timer.current = null), void window.aw.todos.padSet(folder, t).catch(onError)), 400)
  }
  const flush = async () => {
    if (timer.current) (clearTimeout(timer.current), (timer.current = null))
    await window.aw.todos.padSet(folder, latest.current)
  }
  const plan = useMemo(() => padPlan(text ?? '', lists), [text, lists])
  const left = plan.rest.split('\n').filter((l) => l.trim() && !/^\s*#/.test(l)).length
  const make = () =>
    void flush()
      .then(() => window.aw.todos.padMake(folder))
      .then(async (n) => {
        const t = await window.aw.todos.padGet(folder)
        setText(t)
        latest.current = t
        setStatus(`Made ${n} task${n === 1 ? '' : 's'}. They are on the board.`)
      })
      .catch(onError)
  const undo = () =>
    void flush()
      .then(() => window.aw.todos.padUndo(folder))
      .then(async (n) => {
        const t = await window.aw.todos.padGet(folder)
        setText(t)
        latest.current = t
        setStatus(n ? `Took back ${n} task${n === 1 ? '' : 's'}; their lines are in the pad again.` : 'Nothing to take back (a task someone started on stays).')
      })
      .catch(onError)
  return (
    <section className="td-pad" aria-label="Scratch pad">
      <div className="td-pad-edit">
        <textarea value={text ?? ''} disabled={text === null} onChange={(e) => change(e.target.value)} placeholder={PLACEHOLDER} aria-label="Scratch pad text" spellCheck={false} />
      </div>
      <div className="td-pad-prev" aria-label="What the pad will make">
        <h5>{plan.tasks.length ? `This will make ${plan.tasks.length} task${plan.tasks.length === 1 ? '' : 's'}` : 'Nothing to make yet'}</h5>
        {plan.tasks.length === 0 && <p className="hint">Write a line that starts with <code>- [ ]</code> or <code>-</code>. A heading like <code>## Chat</code> above it picks the list; an indented line under it is its notes.</p>}
        <ul>
          {plan.tasks.map((t, i) => (
            <li key={i}><span className={`td-ck${t.done ? ' on' : ''}`} aria-hidden="true">{t.done ? '✓' : ''}</span><span className="td-pad-t">{t.title}{t.notes && <small> · {t.notes.split('\n').length} line{t.notes.includes('\n') ? 's' : ''} of notes</small>}</span><code>{t.list ?? INBOX}</code></li>
          ))}
        </ul>
        {plan.tasks.length > 0 && left > 0 && <p className="hint">{left} line{left === 1 ? ' stays' : 's stay'} in the pad (not tasks).</p>}
        <div className="td-pad-act">
          <button className="primary" disabled={plan.tasks.length === 0} onClick={make}>{plan.tasks.length === 1 ? 'Make 1 task' : `Make ${plan.tasks.length} tasks`}</button>
          <button onClick={undo}>Undo last</button>
          {status && <button className="td-link-btn" onClick={onShowBoard}>Show the board</button>}
        </div>
        {status && <p className="hint" role="status">{status}</p>}
      </div>
    </section>
  )
}
