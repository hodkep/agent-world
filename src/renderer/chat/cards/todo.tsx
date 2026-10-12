import { TodoLink } from '../../todos/TodoLink'
import { openMessage, todoBrief, useTodoVersion } from '../../todos/todoStore'
import { isTodoCall, parseTodoCall, type TodoCall } from './todoCalls'
import { registerToolCard, type ToolCardProps } from './registry'

const WHAT: Record<TodoCall['kind'], { icon: string; tone: string }> = {
  add: { icon: '＋', tone: 'add' },
  list: { icon: '☰', tone: '' },
  search: { icon: '⌕', tone: '' },
  get: { icon: '◎', tone: '' },
  claim: { icon: '▶', tone: 'claim' },
  done: { icon: '✓', tone: 'done' },
  update: { icon: '✎', tone: '' }
}

function Shell({ kind, children, side, body }: { kind: TodoCall['kind']; children: React.ReactNode; side?: React.ReactNode; body?: React.ReactNode }) {
  const w = WHAT[kind]
  return (
    <div className={`tcard todo-card ${w.tone}`} data-todo-card={kind}>
      <div className="tcard-h"><span className="tcard-ic" aria-hidden="true">{w.icon}</span>{children}{side && <span className="tcard-side">{side}</span>}</div>
      {body && <div className="tcard-b">{body}</div>}
    </div>
  )
}

/** The cards for the todo tools: what was asked, and what it came to, with a link to the task. */
function TodoCard({ run, working }: ToolCardProps) {
  useTodoVersion()
  const call = parseTodoCall(run.name, run.input, run.result)
  if (!call) return null
  const failed = run.result?.isError
  const pending = !run.result && working
  if (failed) return <Shell kind={call.kind} body={<span className="tcard-err">{run.result!.text}</span>}><b>Could not {call.kind === 'list' ? 'list the todos' : `${call.kind} a todo`}</b></Shell>
  switch (call.kind) {
    case 'add':
      return (
        <Shell kind="add" side={call.list && `to ${call.list}`} body={(call.needsYou || call.notes) && <>{call.needsYou && <span className="td-flag">needs you</span>}{call.notes && <span className="tcard-note">{call.notes}</span>}</>}>
          <b>{pending ? 'Adding' : 'Added'} todo</b>
          {call.id ? <TodoLink id={call.id} /> : <span className="tcard-muted">{call.title}</span>}
        </Shell>
      )
    case 'list':
      return (
        <Shell kind="list" side={pending ? 'listing…' : call.empty ? 'nothing open' : `${call.rows.length} shown · ${call.rows.filter((r) => r.needsYou).length} need you`} body={call.rows.length > 0 && (
          <table className="tcard-table"><tbody>
            {call.rows.slice(0, 8).map((r) => (
              <tr key={r.id}><td><TodoLink id={r.id} showTitle={false} /></td><td>{r.title}</td><td className="tcard-muted">{r.on ? `${r.on} doing` : r.status === 'blocked' ? 'blocked' : r.needsYou ? 'needs you' : r.by}</td></tr>
            ))}
            {call.rows.length > 8 && <tr><td colSpan={3} className="tcard-muted">+ {call.rows.length - 8} more</td></tr>}
          </tbody></table>
        )}><b>Listed the todos</b></Shell>
      )
    case 'search':
      return (
        <Shell kind="search" side={pending ? 'searching…' : call.empty ? 'nothing found' : `${call.rows.length} found`} body={call.rows.length > 0 && (
          <table className="tcard-table"><tbody>
            {call.rows.slice(0, 6).map((r) => (
              <tr key={r.id}><td><TodoLink id={r.id} showTitle={false} /></td><td>{r.title}</td><td className="tcard-muted">{r.status === 'done' ? `done${r.by ? ` · ${r.by}` : ''}` : r.status}</td></tr>
            ))}
          </tbody></table>
        )}><b>Searched the todos</b><span className="tcard-muted">“{call.query}”</span></Shell>
      )
    case 'get':
      return <Shell kind="get"><b>Read</b><TodoLink id={call.id} /></Shell>
    case 'claim':
      return <Shell kind="claim"><b>{pending ? 'Taking' : 'Took'}</b><TodoLink id={call.id} /></Shell>
    case 'done': {
      const link = todoBrief(call.id)?.link
      return (
        <Shell kind="done" side={link && <button className="todo-ref" onClick={() => openMessage(link)} title="Open the message in the chat">Open message ↗</button>} body={(call.note || call.how || call.files.length > 0) && <>{call.note && <span>{call.note}</span>}{call.how && <span className="tcard-note">{call.how}</span>}{call.files.length > 0 && <span className="tcard-muted">{call.files.slice(0, 4).join(', ')}{call.files.length > 4 ? ` +${call.files.length - 4}` : ''}</span>}</>}>
          <b>{pending ? 'Marking' : 'Marked'} done</b>
          <TodoLink id={call.id} />
        </Shell>
      )
    }
    case 'update':
      return (
        <Shell kind="update" body={call.changes.length > 0 && call.changes.map((c) => <div key={c.label} className="tcard-chg"><span className="tcard-muted">{c.label}</span><span>→ {c.to}</span></div>)}>
          <b>Updated</b>
          <TodoLink id={call.id} />
        </Shell>
      )
  }
}

registerToolCard({ id: 'todo', match: (c) => isTodoCall(c.name), Card: TodoCard })
