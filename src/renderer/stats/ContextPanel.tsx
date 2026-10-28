import { useEffect, useState } from 'react'
import { BANDS } from '../../shared/contextCurve'
import { insightsOf, type AgentContext, type ContextView } from '../../shared/contextView'

const W = 640
const H = 210
const k = (n: number) => `${Math.round(n / 1000)}k`
const pct = (x: number) => `${Math.round(x * 100)}%`
const SHOWN = 5

/** One agent's context across the days: bands shaded at 100k and 200k, the line, and a gold mark where it was compacted. */
function Chart({ a }: { a: AgentContext }) {
  const top = Math.max(300_000, Math.ceil(a.report.peak / 100_000) * 100_000)
  const y = (v: number) => H - (Math.min(v, top) / top) * H
  const x = (i: number) => (a.points.length > 1 ? (i / (a.points.length - 1)) * W : 0)
  const line = a.points.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  return (
    <svg className="cx-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${a.name}'s context at each request, peaking at ${k(a.report.peak)}, compacted ${a.resets.length} times`}>
      <rect className="cx-b3" x="0" y="0" width={W} height={y(BANDS[1]!)} />
      <rect className="cx-b2" x="0" y={y(BANDS[1]!)} width={W} height={y(BANDS[0]!) - y(BANDS[1]!)} />
      {[BANDS[0]!, BANDS[1]!].map((b) => (
        <g key={b}>
          <line className="cx-grid" x1="0" x2={W} y1={y(b)} y2={y(b)} />
          <text className="cx-tick" x="6" y={y(b) - 5}>{k(b)}</text>
        </g>
      ))}
      <polygon className="cx-area" points={`0,${H} ${line} ${W},${H}`} />
      {a.resets.map((r) => (
        <g key={r.at}>
          <line className="cx-flag" x1={x(r.at)} x2={x(r.at)} y1="0" y2={H} />
          <circle className="cx-dot" cx={x(r.at)} cy={y(r.after)} r="3.5"><title>{`compacted ${k(r.before)} to ${k(r.after)}`}</title></circle>
        </g>
      ))}
    </svg>
  )
}

/** The three size bands as one bar, with what each held. */
function Bands({ v }: { v: ContextView }) {
  const names = [`under ${k(BANDS[0]!)}`, `${k(BANDS[0]!)} to ${k(BANDS[1]!)}`, `over ${k(BANDS[1]!)}`]
  return (
    <>
      <div className="cx-bar" role="img" aria-label={v.total.bands.map((b, i) => `${names[i]}: ${pct(b.share)} of the cost`).join(', ')}>
        {v.total.bands.map((b, i) => <i key={i} className={`cx-s${i + 1}`} style={{ width: `${b.share * 100}%` }} />)}
      </div>
      <div className="cx-key">
        {v.total.bands.map((b, i) => <span key={i}><s className={`cx-s${i + 1}`} />{names[i]} <b>{b.requests}</b> requests · {pct(b.share)} of the cost</span>)}
      </div>
    </>
  )
}

/** How big the context was at each request, per agent, and how much of the cost came from a big one: the thing that makes a long session dear. */
export function ContextPanel({ days, account }: { days: number; account?: string }) {
  const [v, setV] = useState<ContextView | null>(null)
  const [pick, setPick] = useState<string | null>(null)
  useEffect(() => void window.aw.contextView(days, account).then(setV), [days, account])
  if (!v) return null
  if (!v.total.requests) return <section><h3>Context size</h3><p className="st-note">No requests counted in this time.</p></section>
  const shown = v.agents.slice(0, SHOWN)
  const a = shown.find((x) => x.agent === pick) ?? undefined
  const was = v.before ? v.before.bands[2]!.share : null
  const now = v.total.bands[2]!.share
  return (
    <section className="cx">
      <div className="st-row">
        <h3>Context size <span className="lm-hint">a request re-reads everything said so far</span></h3>
        <span className="st-seg" role="group" aria-label="Show context of">
          <button className={a ? '' : 'on'} aria-pressed={!a} onClick={() => setPick(null)}>All</button>
          {shown.map((x) => <button key={x.agent} className={a === x ? 'on' : ''} aria-pressed={a === x} onClick={() => setPick(x.agent)}>{x.name}</button>)}
        </span>
      </div>
      <p className="cx-trend">
        Cost from requests over {k(BANDS[1]!)}: <b className={was === null ? undefined : now > was ? 'up' : 'down'}>{pct(now)}</b>{' '}
        {was === null ? '(nothing recorded in the days before to compare with)' : `(${pct(was)} in the ${days} days before)`}
      </p>
      {a ? (
        <>
          <Chart a={a} />
          {a.resets.length > 0 && <div className="cx-chips">{a.resets.slice(-6).map((r) => <span key={r.at} className="cx-chip">compacted <b>{k(r.before)}</b> → <b>{k(r.after)}</b></span>)}</div>}
        </>
      ) : (
        <Bands v={v} />
      )}
      <div className="cx-ins">{insightsOf(v, a?.name).map((t) => <div key={t}>{t}</div>)}</div>
      <p className="st-note">An estimate in input-token weight (cache read a tenth, cache write 1.25, output 5). A compaction is a fall to under 60% of the context before that stays low.</p>
    </section>
  )
}
