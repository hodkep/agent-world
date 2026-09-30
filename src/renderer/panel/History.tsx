import { useEffect, useState } from 'react'
import type { PastSession } from '../../shared/api'

const ago = (ms: number) => {
  const mins = Math.max(1, Math.round((Date.now() - ms) / 60_000))
  if (mins < 60) return `${mins}m ago`
  return mins < 1440 ? `${Math.round(mins / 60)}h ago` : `${Math.round(mins / 1440)}d ago`
}

/** Earlier Claude conversations in the open folder; picking one brings it back as an agent. */
export function History({ folder, onResume, onClose }: { folder: string; onResume: (id: string) => Promise<void>; onClose: () => void }) {
  const [sessions, setSessions] = useState<PastSession[] | null>(null)
  useEffect(() => void window.aw.listHistory(folder).then(setSessions, () => setSessions([])), [folder])
  return (
    <section className="history" aria-label="Past conversations" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="history-head">
        <b>Past conversations</b>
        <button onClick={onClose}>Close</button>
      </div>
      {sessions === null ? <p className="hint">Loading…</p> : sessions.length === 0 ? <p className="hint">Nothing saved for this folder yet.</p> : (
        <ul>
          {sessions.slice(0, 40).map((s) => (
            <li key={s.id}>
              <button disabled={s.inUse} onClick={() => void onResume(s.id)} title={s.inUse ? 'An agent here already runs this conversation' : 'Continue this conversation as a new agent'}>
                <span className="title">{s.title}</span>
                <span className="when">{s.inUse ? 'running' : ago(s.updated)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
