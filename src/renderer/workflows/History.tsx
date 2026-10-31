import { useCallback, useEffect, useState } from 'react'
import type { HistoryEntry } from '../../shared/builder'

const HOW = { project: 'saved to the project', global: 'saved for everything', replace: 'replaced the saved one', copy: 'saved as a copy' } as const
const when = (t: number) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

/** The changes saved through the builder to one workflow, newest first: the same list the builder can read, so you both see why it is the way it is. */
export function History({ folder, id, empty }: { folder: string | null; id: string; /** What to say when nothing was saved yet; without it the list is left out. */ empty?: string }) {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const load = useCallback(() => void window.aw.workflows.history(folder, id).then(setEntries, () => setEntries([])), [folder, id])
  useEffect(() => {
    load()
    return window.aw.onWorkflows(load)
  }, [load])
  if (entries.length === 0) return empty ? <p className="bs-none">{empty}</p> : null
  return (
    <div className="bs-history" role="region" aria-label={`History of ${id}`}>
      <span className="bs-sub">History</span>
      <ul>
        {entries.map((e) => (
          <li key={e.at}>
            <span className="muted">{when(e.at)}</span>
            <span>{HOW[e.how]}: {e.summary}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

