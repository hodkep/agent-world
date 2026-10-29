import { useEffect, useState } from 'react'
import type { Prefs } from '../../shared/types'
import type { Scored } from '../../shared/runnerScore'

const MODES: { value: Prefs['runnerMode']; label: string; hint: string }[] = [
  { value: 'off', label: 'Off', hint: 'Agents are not offered pick_runner.' },
  { value: 'suggest', label: 'Suggest', hint: 'An agent may ask pick_runner which model to use, and decides itself.' },
  { value: 'auto', label: 'Automatic', hint: 'A subagent asked for without a model starts on the one picked for its kind of work.' }
]

const pct = (x: number | undefined) => (x === undefined ? '–' : `${Math.round(x * 100)}`)

/** How subagents get their model, and the scores behind the pick: the benchmark, how the work it was given was rated, and the two together. */
export function ModelRouting({ mode, onMode }: { mode: Prefs['runnerMode']; onMode: (m: Prefs['runnerMode']) => void }) {
  const [rows, setRows] = useState<Scored[]>([])
  useEffect(() => void window.aw.runnerTable().then(setRows), [mode])
  return (
    <div className="set-sub" role="group" aria-label="Model routing">
      <span className="lab">Model routing</span>
      <p className="hint">Which model does a subagent's work. The pick takes the cheapest model whose score clears the kind of work, and a free hired agent before a new one.</p>
      <div className="hire-opts" role="radiogroup" aria-label="Model routing mode">
        {MODES.map((m) => (
          <label key={m.value} className="hire-opt" data-on={mode === m.value}>
            <input type="radio" name="runner-mode" value={m.value} checked={mode === m.value} onChange={() => onMode(m.value)} />
            <b>{m.label}</b>
            <span className="hint">{m.hint}</span>
          </label>
        ))}
      </div>
      <table className="mr-table" aria-label="Model scores">
        <thead>
          <tr>
            <th>Model</th>
            <th>Benchmark</th>
            <th>Rated runs</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.model}>
              <td>
                {r.model}
                <span className="hint"> {r.program}</span>
              </td>
              <td>{pct(r.benchmark)}</td>
              <td>{r.rated ? `${r.accepted} of ${r.rated} accepted` : 'none yet'}</td>
              <td>
                <b>{pct(r.score)}</b>
                {r.score === undefined && <span className="hint"> never picked</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
