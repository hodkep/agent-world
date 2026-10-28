import { useLayoutEffect, useRef, useState } from 'react'
import { subtasksOf, type MessageLink, type Todo, type TodoBoard } from '../../shared/todos'
import { TaskLabels } from './Labels'
import type { AskMode } from '../../shared/todoAsk'
import { Markdown } from '../chat/markdown'
import type { useConfirm } from '../panel/ConfirmDialog'
import { activityOf, actorTag, agoLabel, autoClosed } from './todoView'

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
  if (t.status === 'done' && autoClosed(t)) {
    return (
      <div className="td-banner done auto" role="status">
        <span className="td-big" aria-hidden="true">⚙</span>
        <div><b>Closed by Agent World · {agoLabel(t.doneAt ?? t.updatedAt)}</b><div>{autoClosed(t) === 'stopped' ? `${t.doneBy?.name ?? 'The agent'} had stopped when the board was opened` : `${t.doneBy?.name ?? 'The agent'}'s turn ended`}, and nobody said it was done.</div></div>
      </div>
    )
  }
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

/** A message a task points at: what it said, as markdown, and a way to open it in its chat. */
/** How many blocks of the message (a paragraph, a code block, a table) show before the rest is a click away. */
const FOLD = 3

function Source({ label, link, open, onOpen }: { label: string; link: MessageLink; open: string; onOpen: (l: MessageLink) => void }) {
  const [whole, setWhole] = useState(false)
  const quote = useRef<HTMLDivElement>(null)
  const [blocks, setBlocks] = useState(0)
  // The fold is on whole drawn blocks, never mid-line, so the count is read from what markdown drew.
  useLayoutEffect(() => setBlocks(quote.current?.querySelector('.md')?.childElementCount ?? 0), [link.excerpt])
  const hidden = blocks - FOLD
  return (
    <section className="td-sec" aria-label={label}>
      <h5>{label}</h5>
      {link.excerpt && (
        <div ref={quote} className={`td-quote td-md${whole ? ' whole' : ''}`}>
          <Markdown text={link.excerpt} />
        </div>
      )}
      {hidden > 0 && (
        <button className="td-link-btn td-more" onClick={() => setWhole((w) => !w)}>
          {whole ? 'Show less' : <>Show the rest<span className="n">{hidden} more</span></>}
        </button>
      )}
      <button className="primary td-open" onClick={() => onOpen(link)}>{open} ↗</button>
      {link.excerpt.endsWith('…') && <span className="td-rest">The rest is in the message</span>}
    </section>
  )
}

/** One task, opened: its outcome, details, where it came from, what happened, and a way to ask any agent about it. */
/** A text box that is as tall as what is in it (up to a limit), so notes are read without scrolling a small box. */
function Grow({ value, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const el = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const t = el.current
    if (!t) return
    t.style.height = 'auto'
    const want = t.scrollHeight + 4
    t.style.height = `${Math.min(want, 360)}px`
    t.style.overflowY = want > 360 ? 'auto' : 'hidden'
  }, [value])
  return <textarea ref={el} value={value} {...rest} />
}

/** A workflow run a task belongs to, and how it stands. */
export interface TodoRun {
  id: string
  workflow: string
  stands: string
}

type Tab = 'overview' | 'subtasks' | 'activity' | 'how' | 'ask'

export function TodoDetail({ t, board, folder, agents, runs = [], onOpenRun, onSelect, onClose, act, onOpenMessage, onAsk, confirm }: {
  t: Todo
  board: TodoBoard
  folder: string
  agents: AskAgent[]
  /** The workflow runs this task belongs to. */
  runs?: TodoRun[]
  onOpenRun?: (runId: string) => void
  /** Open another task (a subtask, or the umbrella). */
  onSelect: (id: string) => void
  onClose: () => void
  act: (p: Promise<unknown>) => void
  onOpenMessage: (l: MessageLink) => void
  onAsk: (agentId: string, message: string, openChat: boolean) => Promise<void>
  confirm: ReturnType<typeof useConfirm>[0]
}) {
  const [title, setTitle] = useState(t.title)
  const [notes, setNotes] = useState(t.notes)
  const [tab, setTab] = useState<Tab>('overview')
  const [sub, setSub] = useState('')
  const done = t.status === 'done'
  const activity = activityOf(t)
  const parts = subtasksOf(board, t.id)
  const umbrella = t.parent ? board.todos.find((x) => x.id === t.parent) : undefined
  const hasHow = done && !!(t.doneHow || t.doneFiles?.length || t.doneCommits?.length)
  // An umbrella cannot be nested again, and a task with parts cannot become a part: only the others are offered.
  const umbrellas = parts.length ? [] : board.todos.filter((x) => !x.parent && x.id !== t.id)
  const tabs: [Tab, string][] = [['overview', 'Overview'], ...(umbrella ? [] : [['subtasks', `Subtasks ${parts.length}`] as [Tab, string]]), ['activity', `Activity ${activity.length}`], ...(hasHow ? [['how', 'How'] as [Tab, string]] : []), ['ask', 'Ask']]
  const addPart = () => {
    const v = sub.trim()
    setSub('')
    if (v) act(window.aw.todos.add(folder, { title: v, parent: t.id }))
  }
  return (
    <aside className="td-detail" aria-label="Task detail">
      <div className="td-dhead">
        <div className="td-dtop">
          <span className="td-addr">todo#{t.id} · {t.list}{umbrella && <> · part of <button className="td-link-btn" onClick={() => onSelect(umbrella.id)}>{umbrella.title}</button></>}</span>
          <button className="td-x" onClick={onClose} aria-label="Close detail">×</button>
        </div>
        <input className="td-dtitle" value={title} aria-label="Task title" onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() && title !== t.title && act(window.aw.todos.update(folder, t.id, { title }))} />
        <div className="td-chips">
          <span className={`td-st ${t.status}`}>{t.status === 'doing' && t.claimedBy ? `doing · ${t.claimedBy.name}` : t.stale ? 'unfinished' : t.status}</span>
          {t.needsYou && !done && <span className="td-flag">needs you</span>}
          <TaskLabels board={board} names={t.labels ?? []} onChange={(labels) => act(window.aw.todos.update(folder, t.id, { labels }))} />
        </div>
      </div>
      <div className="td-tabs" role="tablist" aria-label="Task sections">
        {tabs.map(([k, label]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{label}</button>)}
      </div>
      <div className="td-pane" role="tabpanel" aria-label={tabs.find(([k]) => k === tab)?.[1]}>
        {tab === 'overview' && (
          <>
            {(done || t.status === 'blocked' || t.stale) && <Banner t={t} />}
            <dl className="td-meta">
              <dt>Made by</dt><dd><Who a={t.createdBy} /> · {agoLabel(t.createdAt)}{t.auto ? ' · from your message' : ''}</dd>
              {!parts.length && (
                <>
                  <dt>Part of</dt>
                  <dd>
                    <select value={t.parent ?? ''} aria-label="Part of" onChange={(e) => act(window.aw.todos.update(folder, t.id, { parent: e.target.value }))}>
                      <option value="">Nothing: it stands alone</option>
                      {umbrellas.map((x) => <option key={x.id} value={x.id}>todo#{x.id} · {x.title}</option>)}
                    </select>
                  </dd>
                </>
              )}
              {runs.length > 0 && <><dt>{runs.length === 1 ? 'Workflow run' : 'Workflow runs'}</dt><dd>{runs.map((r) => <button key={r.id} className="su-link td-run" onClick={() => onOpenRun?.(r.id)}>{r.workflow} · {r.stands} ↗</button>)}</dd></>}
            </dl>
            <Grow className="td-notes grow" rows={3} value={notes} placeholder="Notes" aria-label="Task notes" onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== t.notes && act(window.aw.todos.update(folder, t.id, { notes }))} />
            <label className="td-check"><input type="checkbox" checked={t.needsYou} onChange={(e) => act(window.aw.todos.update(folder, t.id, { needsYou: e.target.checked }))} /> Needs you (a step only a person can do)</label>
            {t.createdLink && <Source label="Where it came from" link={t.createdLink} open="Open the message it was made in" onOpen={onOpenMessage} />}
            {done && t.doneLink && <Source label="Where it was finished" link={t.doneLink} open="Open the message it was finished in" onOpen={onOpenMessage} />}
          </>
        )}
        {tab === 'subtasks' && (
          <>
            {parts.length === 0 && <p className="hint">Nothing under this task yet. A subtask is a smaller task that is part of it; the task is done when its last one is.</p>}
            <ul className="td-parts" aria-label="Subtasks">
              {parts.map((x) => (
                <li key={x.id} className={x.status}>
                  <button className="td-ck" role="checkbox" aria-checked={x.status === 'done'} aria-label={`${x.status === 'done' ? 'Reopen' : 'Finish'} ${x.title}`} onClick={() => act(x.status === 'done' ? window.aw.todos.reopen(folder, x.id) : window.aw.todos.done(folder, x.id))}>{x.status === 'done' ? '✓' : ''}</button>
                  <button className="td-part" onClick={() => onSelect(x.id)}>{x.title}</button>
                  {x.status === 'doing' && <span className="td-st doing">{x.claimedBy?.name ?? 'doing'}</span>}
                  <small>#{x.id}</small>
                </li>
              ))}
            </ul>
            <input className="td-new" value={sub} placeholder="＋ Add a subtask" aria-label="Add a subtask" onChange={(e) => setSub(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addPart() }} />
          </>
        )}
        {tab === 'activity' && (
          <ul className="td-act">
            {activity.map((a, i) => <li key={i} className={`${a.key ? 'k' : ''}${a.app ? ' app' : ''}`}>{a.text} <small>· {agoLabel(a.at)}</small></li>)}
          </ul>
        )}
        {tab === 'how' && (
          <>
            {t.doneHow && <div className="td-md"><Markdown text={t.doneHow} /></div>}
            {t.doneCommits && t.doneCommits.length > 0 && (
              <ul className="td-commits" aria-label="Commits">
                {t.doneCommits.map((c) => <li key={c.sha}><code>{c.sha}</code> {c.subject}</li>)}
              </ul>
            )}
            {t.doneFiles && t.doneFiles.length > 0 && <div className="td-files" aria-label="Files">{t.doneFiles.map((f) => <code key={f}>{f}</code>)}</div>}
          </>
        )}
        {tab === 'ask' && <AskAgentBox t={t} agents={agents} onAsk={onAsk} folder={folder} act={act} />}
      </div>
      <div className="td-foot">
        <button className="primary" onClick={() => act(done ? window.aw.todos.reopen(folder, t.id) : window.aw.todos.done(folder, t.id))}>{done ? 'Reopen' : 'Mark done'}</button>
        <button className="danger" onClick={() => void confirm({ title: `Remove “${t.title}”?`, body: parts.length ? `It is deleted for you and for the agents. Its ${parts.length} subtask${parts.length === 1 ? '' : 's'} stay as tasks of their own. This cannot be undone.` : 'It is deleted for you and for the agents. This cannot be undone.', confirm: 'Remove', danger: true }).then((yes) => { if (yes) { act(window.aw.todos.remove(folder, t.id)); onClose() } })}>Remove</button>
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
      <Grow className="td-notes grow" rows={2} value={words} placeholder={mode === 'ask' ? 'Your question' : 'Anything to add? (optional)'} aria-label="What to say" onChange={(e) => setWords(e.target.value)} />
      <label className="td-check"><input type="checkbox" checked={openChat} onChange={(e) => setOpenChat(e.target.checked)} /> Open {agent?.name ?? 'its'} chat after sending</label>
      <div className="td-send">
        <button className="primary" disabled={!agent || busy || (mode === 'ask' && !words.trim())} onClick={send}>Send to {agent?.name ?? 'agent'}</button>
        <span className="hint">{agent?.name ?? 'The agent'} gets todo#{t.id}, its notes and the message it came from.{agent?.state === 'asleep' ? ' It is asleep and wakes to read it.' : ''}</span>
      </div>
      {sent && <div className="td-sent" role="status"><b>Sent to {sent.name}</b> · just now{sent.mode === 'work' ? ` · ${sent.name} is on it now` : ''}</div>}
    </section>
  )
}
