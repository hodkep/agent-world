import { useState } from 'react'
import type { AgentMessage, AgentRecord } from '../../shared/types'

const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

/** Messages agents have sent each other: who asked whom, what, and whether it arrived. Newest first. */
export function TracesView({ messages, agents, currentId }: { messages: AgentMessage[]; agents: AgentRecord[]; currentId: string | null }) {
  const [onlyThis, setOnlyThis] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const name = (id: string) => agents.find((a) => a.id === id)?.name ?? 'removed agent'
  const shown = onlyThis && currentId ? messages.filter((m) => m.fromId === currentId || m.toId === currentId) : messages
  const me = currentId ? name(currentId) : ''
  return (
    <div className="traces">
      <div className="traces-head">
        <b>Traces</b>
        <span className="hint">What agents have asked each other</span>
        {currentId && (
          <label className="check push">
            <input type="checkbox" checked={onlyThis} onChange={(e) => setOnlyThis(e.target.checked)} /> Only {me}
          </label>
        )}
      </div>
      {shown.length === 0 ? (
        <p className="hint">{messages.length ? `Nothing involving ${me}.` : 'No messages yet. When one agent asks another to review or help, it shows up here.'}</p>
      ) : (
        <ul>
          {shown.map((m) => (
            <li key={m.id} className={`message is-${m.status}`}>
              <button className="trace-row" aria-expanded={open === m.id} onClick={() => setOpen(open === m.id ? null : m.id)}>
                <span className="trace-who">
                  <b>{name(m.fromId)}</b> → <b>{name(m.toId)}</b>
                </span>
                <span className="status">{m.status}</span>
                <span className="trace-time">{time(m.at)}</span>
                <span className={`detail ${open === m.id ? 'full' : ''}`}>{m.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
