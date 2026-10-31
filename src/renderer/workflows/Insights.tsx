import { useState } from 'react'
import { runsWithin, troubleByWorkflow } from '../../shared/insights'
import type { Run } from '../../shared/runs'
import type { StepContext } from '../../shared/steps'

const SHOWN = 3
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

/**
 * The Insights tab: what keeps going wrong, workflow by workflow. A card for each step that was skipped or failed (worst first, three to start with and the rest on "Show all"),
 * with when it happened over the runs and the reason given most often; a step met every time is one quiet line. A card opens the newest run behind it.
 */
export function Insights({ runs, ctxFor, now, onOpenRun }: { runs: Run[]; ctxFor: (r: Run) => StepContext; now: number; onOpenRun: (id: string) => void }) {
  const [days, setDays] = useState<7 | 30>(7)
  const [all, setAll] = useState<Record<string, boolean>>({})
  const trouble = troubleByWorkflow(runsWithin(runs, days, now), ctxFor)
  return (
    <div className="mo">
      <div className="mo-span" role="radiogroup" aria-label="How far back">
        {([7, 30] as const).map((d) => <button key={d} role="radio" aria-checked={days === d} className={days === d ? 'on' : ''} onClick={() => setDays(d)}>{d} days</button>)}
      </div>
      {trouble.length === 0 ? (
        <p className="hint">No runs of a workflow in the last {days} days.</p>
      ) : (
        trouble.map((w) => {
          const cards = all[w.name] ? w.cards : w.cards.slice(0, SHOWN)
          return (
            <section key={w.name} className="ib-wf" aria-label={`${w.name} workflow`}>
              <div className="ib-hd"><b>{w.name}</b><span>{plural(w.runs, 'run')}</span><span className="ib-met"><b>{w.met} of {w.of}</b> steps met</span></div>
              <div className="ib-meter" aria-hidden="true"><i style={{ flex: w.met, background: 'var(--ok)' }} /><i style={{ flex: w.of - w.met, background: 'var(--warn)' }} /></div>
              {cards.length > 0 && (
                <div className="ib-cards">
                  {cards.map((c) => (
                    <button key={c.step} className={`ib-card ${c.failed > 0 ? 'bad' : ''}`} onClick={() => onOpenRun(c.runId)} aria-label={`${c.step}: ${c.failed > 0 ? `failed ${c.failed}` : `skipped ${c.skipped}`} times. Open the newest run`}>
                      <span className="ib-ch"><b>{c.step}</b><em>{c.failed > 0 ? `failed ${c.failed}×` : `skipped ${c.skipped}×`}{c.failed > 0 && c.skipped > 0 ? ` · skipped ${c.skipped}×` : ''}</em></span>
                      <span className="ib-ticks" aria-hidden="true">{c.ticks.map((t, i) => <i key={i} className={t ?? 'none'} />)}</span>
                      {c.reason && <small>{c.reason}</small>}
                      <span className="ib-go">Open the newest run →</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="ib-fold">
                <span>{w.clean.length > 0 ? `${plural(w.clean.length, 'step')} met every time: ${w.clean.slice(0, 3).join(', ')}${w.clean.length > 3 ? `, and ${w.clean.length - 3} more` : ''}` : 'No step was met every time'}</span>
                {w.cards.length > SHOWN && <button onClick={() => setAll({ ...all, [w.name]: !all[w.name] })}>{all[w.name] ? 'Show fewer' : `Show all ${w.cards.length}`}</button>}
              </div>
              {w.cards.length === 0 && <p className="hint">Nothing was skipped or failed.</p>}
            </section>
          )
        })
      )}
    </div>
  )
}
