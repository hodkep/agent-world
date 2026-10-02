import { useEffect, useMemo, useState } from 'react'
import type { PastSession } from '../../shared/api'
import { Modal } from './Modal'

export const ago = (ms: number) => {
  const mins = Math.max(1, Math.round((Date.now() - ms) / 60_000))
  if (mins < 60) return `${mins}m ago`
  return mins < 1440 ? `${Math.round(mins / 60)}h ago` : `${Math.round(mins / 1440)}d ago`
}

export const sizeLabel = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`)

/** The day a conversation belongs under: Today, Yesterday, or the date. */
export function dayLabel(ms: number, now = Date.now()) {
  const day = (t: number) => new Date(new Date(t).getFullYear(), new Date(t).getMonth(), new Date(t).getDate()).getTime()
  const gap = Math.round((day(now) - day(ms)) / 86_400_000)
  if (gap <= 0) return 'Today'
  if (gap === 1) return 'Yesterday'
  return new Date(ms).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}

/** Earlier Claude conversations in the open folder, grouped by day; picking one brings it back as an agent. */
export function History({ folder, onResume, onClose }: { folder: string; onResume: (id: string) => Promise<void>; onClose: () => void }) {
  const [sessions, setSessions] = useState<PastSession[] | null>(null)
  const [q, setQ] = useState('')
  useEffect(() => void window.aw.listHistory(folder).then(setSessions, () => setSessions([])), [folder])
  const groups = useMemo(() => {
    const words = q.trim().toLowerCase()
    const out: { day: string; items: PastSession[] }[] = []
    for (const s of (sessions ?? []).slice(0, 40)) {
      if (words && !s.title.toLowerCase().includes(words)) continue
      const day = dayLabel(s.updated)
      const last = out.at(-1)
      if (last?.day === day) last.items.push(s)
      else out.push({ day, items: [s] })
    }
    return out
  }, [sessions, q])
  return (
    <Modal label="Past conversations" className="history-dialog" onClose={onClose}>
      <section className="history">
        <div className="history-head">
          <b>Past conversations</b>
          <span className="hx-count">{sessions ? `${Math.min(sessions.length, 40)} in this folder` : ''}</span>
          <button onClick={onClose}>Close</button>
        </div>
        {sessions === null ? (
          <p className="hint">Loading…</p>
        ) : sessions.length === 0 ? (
          <p className="hint">Nothing saved for this folder yet.</p>
        ) : (
          <>
            <input className="hx-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by what you asked…" aria-label="Search past conversations" autoFocus />
            <div className="hx-list">
              {groups.length === 0 && <p className="hint">No conversation matches.</p>}
              {groups.map((g) => (
                <section key={g.day}>
                  <h3 className="hx-day">{g.day}</h3>
                  <ul>
                    {g.items.map((s) => (
                      <li key={s.id}>
                        <button className="hx-item" disabled={s.inUse} onClick={() => void onResume(s.id)} title={s.inUse ? 'An agent here already runs this conversation' : 'Continue this conversation as a new agent'}>
                          <span className="hx-title">{s.title}</span>
                          <span className="hx-meta">
                            {s.inUse && <b className="hx-chip live">running{s.agentName ? ` as ${s.agentName}` : ''}</b>}
                            {s.title.startsWith('Review this change') && <b className="hx-chip">review</b>}
                            <span title={new Date(s.updated).toLocaleString()}>{new Date(s.updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {ago(s.updated)}</span>
                            <span>{sizeLabel(s.bytes)}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </>
        )}
      </section>
    </Modal>
  )
}
