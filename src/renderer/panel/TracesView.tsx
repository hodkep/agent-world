import { useState } from 'react'
import type { AgentMessage, AgentRecord } from '../../shared/types'
import { groupByDay } from './dayGroups'

const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

/** Messages agents have sent each other: who asked whom, what, and whether it arrived. Newest first, under day headings. */
export function TracesView({ messages, agents, currentId }: { messages: AgentMessage[]; agents: AgentRecord[]; currentId: string | null }) {
  const [who, setWho] = useState<string | null>(null)
  const [dropped, setDropped] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const name = (id: string) => agents.find((a) => a.id === id)?.name ?? 'removed agent'
  const involved = [...new Set(messages.flatMap((m) => [m.fromId, m.toId]))].filter((id) => agents.some((a) => a.id === id))
  const shown = messages.filter((m) => (!who || m.fromId === who || m.toId === who) && (!dropped || m.status === 'dropped'))
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
        groupByDay(shown, (m) => m.at).map((g, i) => (
          <div key={`${g.label}${i}`} className="day-group">
            <h5 className="day">{g.label}</h5>
            <ul>
              {g.items.map((m) => (
                <li key={m.id} className={`message is-${m.status}`}>
                  <button className="trace-row" aria-expanded={open === m.id} onClick={() => setOpen(open === m.id ? null : m.id)}>
                    <span className="trace-who">
                      <b>{name(m.fromId)}</b> → <b>{name(m.toId)}</b>
                    </span>
                    <span className={`chip status is-${m.status}`}>{m.status}</span>
                    <span className="trace-time">{time(m.at)}</span>
                    <span className={`detail ${open === m.id ? 'full' : ''}`}>{m.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  )
}
