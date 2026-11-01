import { useState } from 'react'
import type { AgentMessage, AgentRecord } from '../../shared/types'
import { BroadcastRows, type RecipientRow } from '../chat/BroadcastCard'
import { groupByDay } from './dayGroups'

const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

/** One trace: a message to one agent, or every copy of one broadcast. */
interface Trace {
  id: string
  fromId: string
  at: number
  text: string
  broadcast: boolean
  copies: AgentMessage[]
}

/** The copies of a broadcast are one trace; each other message is its own. Order is kept: the first copy's place is the trace's. */
function tracesOf(messages: AgentMessage[]): Trace[] {
  const out: Trace[] = []
  const byBroadcast = new Map<string, Trace>()
  for (const m of messages) {
    const t = m.broadcast ? byBroadcast.get(m.broadcast) : undefined
    if (t) t.copies.push(m)
    else {
      const made: Trace = { id: m.broadcast ?? m.id, fromId: m.fromId, at: m.at, text: m.text, broadcast: !!m.broadcast, copies: [m] }
      if (m.broadcast) byBroadcast.set(m.broadcast, made)
      out.push(made)
    }
  }
  return out
}

const gone = (s: AgentMessage['status']) => s === 'dropped' || s === 'asleep' || s === 'limit'
const DROPPED = 'it was closed before it could read this'

/** Messages agents have sent each other: who asked whom, what, and whether it arrived, as a card with a line for each agent it went to. Newest first, under day headings. */
export function TracesView({ messages, agents, currentId }: { messages: AgentMessage[]; agents: AgentRecord[]; currentId: string | null }) {
  const [who, setWho] = useState<string | null>(null)
  const [dropped, setDropped] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const name = (id: string) => agents.find((a) => a.id === id)?.name ?? 'removed agent'
  const involved = [...new Set(messages.flatMap((m) => [m.fromId, m.toId]))].filter((id) => agents.some((a) => a.id === id))
  const shown = tracesOf(messages).filter((t) => (!who || t.fromId === who || t.copies.some((c) => c.toId === who)) && (!dropped || t.copies.some((c) => gone(c.status))))
  const rowOf = (m: AgentMessage): RecipientRow => ({ id: m.toId, name: name(m.toId), status: m.status, reason: m.reason ?? (m.status === 'dropped' ? DROPPED : m.status === 'queued' ? 'busy: gets it when its turn ends' : '') })
  return (
    <div className="traces">
      <div className="traces-head">
        <b>Traces</b>
        <span className="hint">What agents have asked each other</span>
      </div>
      {messages.length > 0 && (
        <div className="traces-filters">
          <button className="chip" aria-pressed={!who} onClick={() => setWho(null)}>Everyone</button>
          {involved.map((id) => (
            <button key={id} className="chip" aria-pressed={who === id} onClick={() => setWho(who === id ? null : id)}>{name(id)}</button>
          ))}
          <button className="chip push" aria-pressed={dropped} onClick={() => setDropped((v) => !v)}>Dropped only</button>
        </div>
      )}
      {shown.length === 0 ? (
        <p className="hint">{messages.length ? 'Nothing matches.' : 'No messages yet. When one agent asks another to review or help, it shows up here.'}</p>
      ) : (
        groupByDay(shown, (t) => t.at).map((g, i) => (
          <div key={`${g.label}${i}`} className="day-group">
            <h5 className="day">{g.label}</h5>
            <ul>
              {g.items.map((t) => (
                <li key={t.id} className="message">
                  <div className="tcard">
                    <button className="trace-row" aria-expanded={open === t.id} onClick={() => setOpen(open === t.id ? null : t.id)}>
                      <span className={`tc-tag ${t.broadcast ? 'bc' : ''}`}>{t.broadcast ? 'Broadcast' : 'Message'}</span>
                      <span className="trace-who">
                        <b>{name(t.fromId)}</b> → {t.broadcast ? <b>{t.copies.length} agent{t.copies.length === 1 ? '' : 's'}</b> : <b>{name(t.copies[0]!.toId)}</b>}
                      </span>
                      <span className="trace-time">{time(t.at)}</span>
                      <span className={`detail ${open === t.id ? 'full' : ''}`}>{t.text}</span>
                    </button>
                    <BroadcastRows rows={t.copies.map(rowOf)} onWake={(r) => void window.aw.wakeAgent(r.id!)} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  )
}
