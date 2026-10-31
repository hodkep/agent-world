import { useEffect, useMemo, useState } from 'react'
import { groupByDay } from './dayGroups'

type Note = Awaited<ReturnType<typeof window.aw.memoryList>>[number]
const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
// What the office saves on its own when a task closes: useful as a log, noisy next to a decision.
const isLog = (n: Note) => /^Done todo#/.test(n.text)

/** What the team has saved about this project. Agents add to it with `remember` and read it with `recall`; you can too. */
export function MemoryView({ agentId }: { agentId: string }) {
  const [notes, setNotes] = useState<Note[] | null>(null)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [by, setBy] = useState<string | null>(null)
  const [hideLog, setHideLog] = useState(false)
  const reload = () => window.aw.memoryList(agentId).then(setNotes, () => setNotes([]))
  useEffect(() => {
    setNotes(null)
    void reload()
  }, [agentId]) // eslint-disable-line react-hooks/exhaustive-deps
  const add = () =>
    window.aw.memoryAdd(agentId, text).then(
      async () => (setText(''), setError(''), await reload()),
      (e: Error) => setError(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    )
  const writers = useMemo(() => [...new Set((notes ?? []).map((n) => n.by))], [notes])
  const shown = (notes ?? []).filter((n) => (!by || n.by === by) && !(hideLog && isLog(n)))
  return (
    <div className="memory">
      <div className="memory-head">
        <b>Agent Memory</b>
        <span className="hint">{notes ? `${notes.length} ${notes.length === 1 ? 'note' : 'notes'} · shared by every agent in this project` : 'Shared by every agent in this project'}</span>
      </div>
      <form className="memory-add" onSubmit={(e) => (e.preventDefault(), void add())}>
        <input aria-label="Add a note" placeholder="Tell every agent something, e.g. tests run with pnpm test" value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit" disabled={!text.trim()}>
          Save
        </button>
      </form>
      {error && <p className="hint bad">{error}</p>}
      {notes && notes.length > 0 && (
        <div className="memory-filters">
          <button className="chip" aria-pressed={!by} onClick={() => setBy(null)}>All</button>
          {writers.map((w) => (
            <button key={w} className="chip" aria-pressed={by === w} onClick={() => setBy(by === w ? null : w)}>{w}</button>
          ))}
          <label className="check push">
            <input type="checkbox" checked={hideLog} onChange={(e) => setHideLog(e.target.checked)} /> Hide finished-task log
          </label>
        </div>
      )}
      {notes === null ? null : notes.length === 0 ? (
        <p className="hint">No notes yet. Agents save what a later agent should know here.</p>
      ) : shown.length === 0 ? (
        <p className="hint">Nothing matches.</p>
      ) : (
        groupByDay(shown, (n) => n.at).map((g, i) => (
          <div key={`${g.label}${i}`} className="day-group">
            <h5 className="day">{g.label}</h5>
            <ul>
              {g.items.map((n) => (
                <li key={n.id}>
                  <span className="who" aria-hidden="true">{n.by.slice(0, 1).toUpperCase()}</span>
                  <span className="grow">
                    {n.text}
                    <span className="detail">{n.by} · {time(n.at)}</span>
                  </span>
                  <button onClick={() => void window.aw.memoryForget(agentId, n.id).then(reload)} aria-label={`Forget: ${n.text.slice(0, 40)}`}>
                    Forget
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
