import { useState } from 'react'
import type { MessageLink, Todo } from '../../shared/todos'
import type { AskMode } from '../../shared/todoAsk'
import { Markdown } from '../chat/markdown'
import type { useConfirm } from '../panel/ConfirmDialog'
import { activityOf, actorTag, agoLabel } from './todoView'

export interface AskAgent {
  id: string
  name: string
  provider: string
  /** 'asleep', or what it is doing. */
  state: string
}

function Who({ a }: { a: Todo['createdBy'] }) {
  const t = actorTag(a)
  return <span className="td-who"><i className={`td-dot ${t.tone}`} />{t.label}{t.forMain && <small className="td-for"> for {t.forMain}</small>}</span>
}

/** What the task is in one glance: open, who is on it, why it is stuck, or who finished it and how. */
function Banner({ t }: { t: Todo }) {
  if (t.status === 'done') {
    return (
      <div className="td-banner done" role="status">
        <span className="td-big" aria-hidden="true">✓</span>
        <div><b>Done{t.doneBy ? ` by ${t.doneBy.name}` : ''} · {agoLabel(t.doneAt ?? t.updatedAt)}</b>{t.doneNote && <div className="td-md"><Markdown text={t.doneNote} /></div>}</div>
      </div>
    )
  }
  if (t.status === 'blocked') return <div className="td-banner blocked" role="status"><span className="td-big" aria-hidden="true">!</span><div><b>Blocked{t.claimedBy ? ` · ${t.claimedBy.name}` : ''}</b>{t.blockedWhy && <div>{t.blockedWhy}</div>}</div></div>
  if (t.status === 'doing') {
    return (
      <div className={`td-banner ${t.stale ? 'blocked' : 'doing'}`} role="status">
        <span className="td-big" aria-hidden="true">{t.stale ? '!' : '▶'}</span>
        <div><b>{t.stale ? 'Unfinished' : 'Doing'}{t.claimedBy ? ` · ${t.claimedBy.name}` : ''}</b>{t.stale && <div>Its turn ended without saying done or blocked.</div>}</div>
      </div>
    )
  }
  return <div className="td-banner open" role="status"><span className="td-big" aria-hidden="true">○</span><div><b>Open</b><div>{t.needsYou ? 'Waiting for you.' : 'Nobody is on it yet.'}</div></div></div>
}

/** One task, opened: its outcome, details, where it came from, what happened, and a way to ask any agent about it. */
export function TodoDetail({ t, folder, agents, onClose, act, onOpenMessage, onAsk, confirm }: {
  t: Todo
  folder: string
  agents: AskAgent[]
  onClose: () => void
  act: (p: Promise<unknown>) => void
  onOpenMessage: (l: MessageLink) => void
  onAsk: (agentId: string, message: string, openChat: boolean) => Promise<void>
  confirm: ReturnType<typeof useConfirm>[0]
}) {
  const [title, setTitle] = useState(t.title)
  const [notes, setNotes] = useState(t.notes)
  const [whole, setWhole] = useState(false)
  const done = t.status === 'done'
  const link = done ? t.doneLink : t.createdLink
  const activity = activityOf(t)
  return (
    <aside className="td-detail" aria-label="Task detail">
      <div className="td-dhead">
        <div className="td-dtop"><span className="td-addr">todo#{t.id} · {t.list}</span><button className="td-x" onClick={onClose} aria-label="Close detail">×</button></div>
        <input className="td-dtitle" value={title} aria-label="Task title" onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() && title !== t.title && act(window.aw.todos.update(folder, t.id, { title }))} />
        <Banner t={t} />
      </div>
      <section className="td-sec" aria-label="Details">
        <h5>Details</h5>
        <textarea className="td-notes" rows={3} value={notes} placeholder="Notes" aria-label="Task notes" onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== t.notes && act(window.aw.todos.update(folder, t.id, { notes }))} />
        <label className="td-check"><input type="checkbox" checked={t.needsYou} onChange={(e) => act(window.aw.todos.update(folder, t.id, { needsYou: e.target.checked }))} /> Needs you (a step only a person can do)</label>
        <div className="td-by">Made by <Who a={t.createdBy} /> · {agoLabel(t.createdAt)}{t.auto ? ' · from your message' : ''}</div>
      </section>
      {link && (
        <section className="td-sec" aria-label="Where it came from">
          <h5>Where it came from</h5>
          {link.excerpt && (
            <div className={`td-quote td-md${whole ? ' whole' : ''}`}>
              <Markdown text={link.excerpt} />
            </div>
          )}
          {link.excerpt.length > 280 && <button className="td-link-btn" onClick={() => setWhole((w) => !w)}>{whole ? 'Show less' : 'Show the whole excerpt'}</button>}
          <button className="primary td-open" onClick={() => onOpenMessage(link)}>{done ? 'Open the message it was finished in' : 'Open the message it was made in'} ↗</button>
        </section>
      )}
      <section className="td-sec" aria-label="Activity">
        <h5>Activity</h5>
        <ul className="td-act">
          {activity.map((a, i) => <li key={i} className={a.key ? 'k' : ''}>{a.text} <small>· {agoLabel(a.at)}</small></li>)}
        </ul>
      </section>
      <AskAgentBox t={t} agents={agents} onAsk={onAsk} folder={folder} act={act} />
      <div className="td-foot">
        <button className="primary" onClick={() => act(done ? window.aw.todos.reopen(folder, t.id) : window.aw.todos.done(folder, t.id))}>{done ? 'Reopen' : 'Mark done'}</button>
        <button className="danger" onClick={() => void confirm({ title: `Remove “${t.title}”?`, body: 'It is deleted for you and for the agents. This cannot be undone.', confirm: 'Remove', danger: true }).then((yes) => { if (yes) { act(window.aw.todos.remove(folder, t.id)); onClose() } })}>Remove</button>
      </div>
    </aside>
  )
}

/** Ask any agent in the project about the task, or put it on one: a menu of agents, what to do, and words to add. */
function AskAgentBox({ t, agents, onAsk, folder, act }: { t: Todo; agents: AskAgent[]; onAsk: (agentId: string, message: string, openChat: boolean) => Promise<void>; folder: string; act: (p: Promise<unknown>) => void }) {
  const [agentId, setAgentId] = useState(t.claimedBy?.id ?? agents[0]?.id ?? '')
  const [mode, setMode] = useState<AskMode>('ask')
  const [words, setWords] = useState('')
  const [openChat, setOpenChat] = useState(true)
  const [sent, setSent] = useState<{ name: string; mode: AskMode } | null>(null)
  const [busy, setBusy] = useState(false)
  const agent = agents.find((a) => a.id === agentId)
  if (agents.length === 0) return <section className="td-sec" aria-label="Ask an agent"><h5>Ask an agent</h5><p className="hint">No agent in this project yet. Hire one to ask it about this task.</p></section>
  const send = () => {
    if (!agent) return
    setBusy(true)
    void window.aw.todos.ask(folder, t.id, agent.id, mode, words).then(
      (r) => onAsk(agent.id, r.message, openChat).then(() => (setSent({ name: agent.name, mode }), setWords('')), (e) => act(Promise.reject(e))),
      (e) => act(Promise.reject(e))
    ).finally(() => setBusy(false))
  }
  return (
    <section className="td-sec td-ask" aria-label="Ask an agent">
      <h5>Ask an agent</h5>
      <label className="td-sel">Agent
        <select value={agentId} aria-label="Agent to ask" onChange={(e) => (setAgentId(e.target.value), setSent(null))}>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.provider === 'agy' ? 'agy' : 'Claude'} · {a.state}</option>)}
        </select>
      </label>
      <div className="td-mode" role="group" aria-label="What to ask">
        <button aria-pressed={mode === 'ask'} onClick={() => setMode('ask')}>Ask a question</button>
        <button aria-pressed={mode === 'work'} onClick={() => setMode('work')}>Work on it</button>
      </div>
      <textarea className="td-notes" rows={2} value={words} placeholder={mode === 'ask' ? 'Your question' : 'Anything to add? (optional)'} aria-label="What to say" onChange={(e) => setWords(e.target.value)} />
      <label className="td-check"><input type="checkbox" checked={openChat} onChange={(e) => setOpenChat(e.target.checked)} /> Open {agent?.name ?? 'its'} chat after sending</label>
      <div className="td-send">
        <button className="primary" disabled={!agent || busy || (mode === 'ask' && !words.trim())} onClick={send}>Send to {agent?.name ?? 'agent'}</button>
        <span className="hint">{agent?.name ?? 'The agent'} gets todo#{t.id}, its notes and the message it came from.{agent?.state === 'asleep' ? ' It is asleep and wakes to read it.' : ''}</span>
      </div>
      {sent && <div className="td-sent" role="status"><b>Sent to {sent.name}</b> · just now{sent.mode === 'work' ? ` · ${sent.name} is on it now` : ''}</div>}
    </section>
  )
}
