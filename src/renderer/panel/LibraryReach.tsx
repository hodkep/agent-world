import { useEffect, useMemo, useState } from 'react'
import type { LibraryItem, Summary } from '../../shared/library'
import { reachedFor, type Health } from './libraryStats'

export type Fix = 'when' | 'firm' | 'step'
const BAR: Record<Health, string> = { bad: 'bad', mid: 'mid', good: 'good', few: 'few' }

/** "Reached for": for each item agents were pointed at, how often they then read it, in words, worst first; an open row offers the fixes. */
export function LibraryReach({ byId, whenOf, onFix }: { byId: Map<string, LibraryItem>; whenOf: (id: string) => string; onFix: (id: string, fix: Fix) => void }) {
  const [stats, setStats] = useState<Summary | null>(null)
  const [program, setProgram] = useState('both')
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => {
    const load = () => void window.aw.library.stats().then(setStats, () => undefined)
    load()
    return window.aw.onLibraryUse(load)
  }, [])
  const r = useMemo(() => (stats ? reachedFor(stats, program, whenOf) : null), [stats, program, whenOf])
  if (!r) return null
  const max = Math.max(1, ...r.rows.map((x) => x.related))
  return (
    <div className="reach">
      <p className="reach-sum">
        {r.rows.length ? (
          <>Reminded <b>{r.reminded} times</b>. On <b>{r.related}</b> prompts that looked related to an item, agents read it <b>{r.read} times</b> ({r.share}%) and said it did not apply <b>{r.declined} times</b>.</>
        ) : (
          'No agent has been reminded of an item yet. This fills in as agents work.'
        )}
      </p>
      <label className="lib-inline">Program
        <select aria-label="Program for these numbers" value={program} onChange={(e) => setProgram(e.target.value)}>
          <option value="both">Both programs</option>
          <option value="claude">Claude</option>
          <option value="agy">agy</option>
        </select>
      </label>
      <div className="reach-rows" aria-label="Items agents were reminded of">
        {r.rows.map((x) => (
          <div key={x.id} className="reach-item">
            <button className="reach-row" aria-expanded={open === x.id} onClick={() => setOpen(open === x.id ? null : x.id)}>
              <span className="reach-n">{byId.get(x.id)?.name ?? x.id}<small className="reach-rem">reminded {x.reminded}×</small></span>
              <span className="reach-bars">
                <span className="reach-bar"><small>related</small><span className="tr"><i className="think" style={{ width: x.related ? `${Math.max(3, (100 * x.related) / max)}%` : 0 }} /></span><small>{x.related}</small></span>
                <span className="reach-bar"><small>read</small><span className="tr"><i className={BAR[x.health]} style={{ width: x.read ? `${Math.max(3, (100 * x.read) / max)}%` : 0 }} /></span><small>{x.read}</small></span>
                <span className="reach-bar" title="The agent said it did not apply, and why"><small>said no</small><span className="tr"><i className="no" style={{ width: x.declined ? `${Math.max(3, (100 * x.declined) / max)}%` : 0 }} /></span><small>{x.declined}</small></span>
              </span>
              <span className="reach-v">{x.text}</span>
            </button>
            {open === x.id && x.reasons.length > 0 && (
              <div className="reach-said" aria-label={`What agents said about ${x.id}`}>
                <b>What agents said when they passed it over</b>
                {x.reasons.map((r) => <span key={r.text} className="hint">“{r.text}”{r.n > 1 ? ` ×${r.n}` : ''}</span>)}
                {x.advice && <span className="advice">{x.advice}</span>}
              </div>
            )}
            {open === x.id && (x.health === 'bad' || x.health === 'mid') && (
              <div className="reach-fix">
                <button className={x.kind === 'ignored' ? '' : 'primary'} onClick={() => onFix(x.id, 'when')}>{x.kind === 'broad' ? 'Write a narrower when' : 'Write a when'}</button>
                <button className={x.kind === 'ignored' ? 'primary' : ''} onClick={() => onFix(x.id, 'firm')}>Make it firm</button>
                <button onClick={() => onFix(x.id, 'step')}>Make it a step</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
