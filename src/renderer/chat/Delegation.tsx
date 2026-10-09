import { type ReactNode, useEffect, useMemo, useState } from 'react'
import type { SubagentInfo } from '../../shared/chat'
import { type Row, type SubagentState, elapsedLabel, subagentState } from './format'
import { pairSubagents } from './delegationMatch'
import { Markdown } from './markdown'
import { openSubagent } from './subagentEvents'

type Call = Extract<Row, { kind: 'delegation' }>['calls'][number]

const WORD: Record<SubagentState, string> = { waiting: 'waiting', working: 'working', done: 'done', stopped: 'stopped' }

/** Asks for the agent's subagents now and again every couple of seconds until all of them have answered (or for good, with `keep`). */
export function useSubagents(agentId: string, calls: Call[] | null, keep = false) {
  const [infos, setInfos] = useState<SubagentInfo[]>([])
  const [now, setNow] = useState(Date.now())
  const key = calls ? calls.map((c) => c.toolUseId).join(',') : '*'
  const mine = useMemo(() => (calls ? pairSubagents(calls, infos) : new Map(infos.map((i) => [i.toolUseId, i]))), [infos, calls])
  // Nothing more will happen to a subagent that answered or was stopped.
  const settled = !keep && !!calls && calls.every((c) => ['done', 'stopped'].includes(subagentState(mine.get(c.toolUseId), now)))
  useEffect(() => {
    let alive = true
    const look = () => void window.aw.subagents(agentId).then((l) => alive && setInfos((old) => (JSON.stringify(old) === JSON.stringify(l) ? old : l)), () => {})
    look()
    if (settled) return () => void (alive = false)
    const t = setInterval(() => (look(), setNow(Date.now())), 1500)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [agentId, settled, key])
  return { mine, infos, now, settled }
}

export function Trail({ info, now }: { info: SubagentInfo | undefined; now: number }) {
  if (!info) return <div className="dg-open dg-muted">Not started yet.</div>
  return (
    <div className="dg-open">
      {info.calls.length === 0 && <div className="dg-muted">No calls yet.</div>}
      {info.calls.map((c, i) => (
        <div key={i} className="dg-call">
          <span className="dg-at">{elapsedLabel(c.at - info.startedAt)}</span>
          <b>{c.name}</b>
          <span className="dg-detail">{c.detail}</span>
        </div>
      ))}
      {info.done && info.result && (
        <div className="dg-result">
          <Markdown text={info.result} />
        </div>
      )}
      {!info.done && <div className="dg-muted">{subagentState(info, now) === 'stopped' ? 'It stopped without giving an answer.' : 'No answer yet.'}</div>}
    </div>
  )
}

export function Timeline({ info, now }: { info: SubagentInfo | undefined; now: number }) {
  if (!info) return <span className="dg-track" aria-hidden="true" />
  const end = info.done ? info.updatedAt : Math.max(now, info.updatedAt)
  const span = Math.max(1, end - info.startedAt)
  return (
    <span className="dg-track" aria-hidden="true">
      {info.calls.map((c, i) => (
        <i key={i} className="dg-tick" style={{ left: `${Math.min(99, ((c.at - info.startedAt) / span) * 100)}%` }} />
      ))}
    </span>
  )
}

/** One subagent as a row: its task, its latest call, a tick for each call, and its time; opens to every call and its answer. */
export function SubagentRowView({ type, description, info, state, now, level = 0, needsYou = false, actions, onOpen }: { type: string; description: string; info: SubagentInfo | undefined; state: SubagentState; now: number; level?: number; needsYou?: boolean; actions?: ReactNode; /** Shown on the row itself: its conversation in the panel beside the chat. */ onOpen?: () => void }) {
  const [open, setOpen] = useState(false)
  const last = info?.calls.at(-1)
  return (
    <div className={`dg-row s-${state} ${needsYou ? 'needs-you' : ''}`} style={level ? { paddingLeft: level * 18 } : undefined} data-level={level}>
      <button className="dg-line" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="dg-dot" aria-hidden="true" />
        <span className="dg-what">
          <span>
            <span className="dg-type">{info?.type ?? type}</span> {description}
            {info?.background && <span className="dg-tag" title="Runs in the background: the main agent carries on while it works">background</span>}
          </span>
          <span className="dg-now">{needsYou ? 'needs you: answer its permission request' : state === 'working' && last ? `${last.name} ${last.detail}` : WORD[state]}</span>
        </span>
        <Timeline info={info} now={now} />
        <span className="dg-time">{info ? elapsedLabel((info.done ? info.updatedAt : now) - info.startedAt) : '–'}</span>
      </button>
      {onOpen && (
        <button className="dg-open-btn" onClick={onOpen} title="Open its conversation in the panel beside the chat">
          Open
        </button>
      )}
      {open && <Trail info={info} now={now} />}
      {open && actions && <div className="dg-actions">{actions}</div>}
    </div>
  )
}

/** The subagents one reply started, as a single card: a row for each, with where it is at and everything it did. */
export function Delegation({ agentId, calls }: { agentId: string; calls: Call[] }) {
  const { mine, now, settled } = useSubagents(agentId, calls)
  const [open, setOpen] = useState<boolean | null>(null)
  const states = calls.map((c) => subagentState(mine.get(c.toolUseId), now))
  const count = (s: SubagentState) => states.filter((x) => x === s).length
  const shown = open ?? !settled
  const summary = [count('working') && `${count('working')} working`, count('waiting') && `${count('waiting')} waiting`, count('done') && `${count('done')} done`, count('stopped') && `${count('stopped')} stopped`].filter(Boolean).join(' · ')
  return (
    <section className={`dg ${settled ? 'is-done' : ''}`} aria-label={`Delegated to ${calls.length} subagent${calls.length === 1 ? '' : 's'}`}>
      <div className="dg-head">
        <span className={`dg-dot s-${settled ? 'done' : 'working'}`} aria-hidden="true" />
        <b className="dg-title">Delegated to {calls.length} subagent{calls.length === 1 ? '' : 's'}</b>
        <span className="dg-count">{summary}</span>
        <button className="dg-toggle" aria-expanded={shown} onClick={() => setOpen(!shown)}>
          {shown ? 'Hide' : `Show ${calls.length === 1 ? 'result' : `${calls.length} results`}`}
        </button>
      </div>
      <div className="dg-seg" aria-hidden="true">
        {states.map((s, i) => (
          <i key={i} className={`s-${s}`} />
        ))}
      </div>
      {shown && (
        <div className="dg-rows">
          {calls.map((c, i) => (
            <SubagentRowView key={c.toolUseId} type={c.subagentType} description={c.description} info={mine.get(c.toolUseId)} state={states[i]!} now={now} actions={mine.get(c.toolUseId) && <button onClick={() => openSubagent(agentId, mine.get(c.toolUseId)!.agentId)}>Open conversation</button>} onOpen={mine.get(c.toolUseId) && (() => openSubagent(agentId, mine.get(c.toolUseId)!.agentId))} />
          ))}
        </div>
      )}
    </section>
  )
}
