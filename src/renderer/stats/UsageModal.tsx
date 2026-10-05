import { useCallback, useEffect, useState } from 'react'
import type { TokensReport, UsageReport } from '../../shared/ledger'
import { LOW_PCT, busiest } from '../../shared/limits'
import { tokenLabel, untilReset } from '../../shared/usage'
import type { LimitWindow, ProviderId, ProviderInfo } from '../../shared/types'
import { ProviderTag } from '../panel/ProviderTag'
import { Modal } from '../panel/Modal'
import { Bars } from './charts'

const money = (n: number) => `$${n.toFixed(2)}`
const RANGES = [7, 30, 90]
const dayLabel = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

const KIND = { five_hour: '5-hour', weekly: 'weekly' } as const
const level = (pct: number) => (pct < LOW_PCT ? 'hot' : pct < 30 ? 'warn' : 'ok')
const left = (w: LimitWindow, now: number) => `${Math.round(w.remainingPct)}% left · resets in ${untilReset(Date.parse(w.resetsAt), now)}`

/** One allowance as a bar of what is left. */
function Allowance({ w, now }: { w: LimitWindow; now: number }) {
  return (
    <div className="lm-row" data-level={level(w.remainingPct)}>
      <b>{KIND[w.kind]}</b>
      <i className="lm-bar" role="img" aria-label={`${Math.round(w.remainingPct)}% left`}><b style={{ width: `${Math.min(100, Math.max(0, w.remainingPct))}%` }} /></i>
      <small>{left(w, now)}</small>
    </div>
  )
}

/** What the agents have cost, by day and by model, from the history the app keeps. */
export function UsageModal({ onClose }: { onClose: () => void }) {
  const [days, setDays] = useState(30)
  const [r, setR] = useState<UsageReport | null>(null)
  const [at, setAt] = useState(Date.now())
  const load = useCallback(() => {
    void window.aw.usageReport(days).then((x) => (setR(x), setAt(Date.now())))
  }, [days])
  useEffect(load, [load])
  const spent = r?.days.filter((d) => d.usd > 0).reverse() ?? []
  const [view, setView] = useState<'all' | ProviderId>('all')
  const [limits, setLimits] = useState<LimitWindow[] | null>(null)
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [tokens, setTokens] = useState<TokensReport | null>(null)
  const now = at
  useEffect(() => {
    void window.aw.getLimits(true).then(setLimits, () => setLimits([]))
    void window.aw.listProviders().then(setProviders, () => setProviders([]))
    void window.aw.tokensReport(7).then(setTokens, () => setTokens(null))
  }, [])
  const shown = providers.filter((p) => p.detection.state === 'ready' || limits?.some((w) => w.provider === p.id))
  const tight = limits ? busiest(limits) : null
  const money7 = r ? money(r.last7) : ''
  return (
    <Modal label="Usage and estimated costs" className="stats" onClose={onClose}>
      <header className="settings-head">
        <b>Usage &amp; Estimated Costs</b>
        <span className="st-nav">
          <button onClick={load} aria-label="Refresh" title="Refresh">↻</button>
          <button onClick={onClose} aria-label="Close" title="Close">×</button>
        </span>
      </header>
      {!r ? (
        <p className="st-note">Loading…</p>
      ) : (
        <div className="st-body">
          {view !== 'all' && (
            <div className="st-row lm-crumbs">
              <button onClick={() => setView('all')}>‹ All providers</button>
              <ProviderTag id={view} label={providers.find((p) => p.id === view)?.label} />
            </div>
          )}
          {view === 'all' && (
            <>
              <div className="st-cards three">
                <div className="st-card" data-level={tight ? level(tight.remainingPct) : undefined}>
                  <span>Busiest limit</span>
                  <b>{tight ? `${Math.round(tight.remainingPct)}% left` : '—'}</b>
                  <small>{tight ? `${tight.group}, ${KIND[tight.kind]}, resets in ${untilReset(Date.parse(tight.resetsAt), now)}` : limits ? 'No limits reported yet' : 'Asking…'}</small>
                </div>
                <div className="st-card"><span>Spent, last 7 days</span><b>{money7}</b><small>{tokens && tokens.total.input + tokens.total.output > 0 ? `+ ${tokenLabel(tokens.total.input + tokens.total.output)} tokens where no price is reported` : 'Dollars, where a provider reports a price'}</small></div>
                <div className="st-card"><span>Providers ready</span><b>{providers.filter((p) => p.detection.state === 'ready').length}</b><small>of {providers.length}</small></div>
              </div>
              <section className="lm-overview">
                <h3>By provider <span className="lm-hint">open one to see its own numbers</span></h3>
                {shown.map((p) => {
                  const ws = (limits ?? []).filter((w) => w.provider === p.id)
                  return (
                    <button key={p.id} className="lm-prow" onClick={() => setView(p.id)} aria-label={`Open ${p.label}`}>
                      <ProviderTag id={p.id} label={p.label} />
                      <span className="lm-mini">
                        {ws.length === 0 ? <small>{limits ? 'No limits reported' : 'Asking…'}</small> : ws.map((w, i) => <span key={i} className="lm-chip" data-level={level(w.remainingPct)}>{new Set(ws.map((x) => x.group)).size > 1 ? `${w.group} ` : ''}{KIND[w.kind]} {Math.round(w.remainingPct)}%</span>)}
                      </span>
                      <span className="lm-go" aria-hidden="true">›</span>
                    </button>
                  )
                })}
              </section>
            </>
          )}
          {view !== 'all' && (
            <section>
              <h3>Limits</h3>
              {(limits ?? []).filter((w) => w.provider === view).length === 0 ? (
                <p className="st-note">{limits ? 'This provider has not reported any limits yet.' : 'Asking…'}</p>
              ) : (
                [...new Set((limits ?? []).filter((w) => w.provider === view).map((w) => w.group))].map((g) => (
                  <div key={g} className="lm-group">
                    <small>{g}</small>
                    {(limits ?? []).filter((w) => w.provider === view && w.group === g).map((w) => <Allowance key={w.kind} w={w} now={now} />)}
                  </div>
                ))
              )}
            </section>
          )}
          {view === 'agy' && (
            <section>
              <h3>Tokens, last 7 days</h3>
              {!tokens || tokens.total.input + tokens.total.output === 0 ? (
                <p className="st-note">{tokens ? 'No tokens recorded yet.' : 'Asking…'}</p>
              ) : (
                <>
                  <div className="st-cards three">
                    <div className="st-card"><span>Read</span><b>{tokenLabel(tokens.total.input)}</b><small>everything sent to the model, cached parts too</small></div>
                    <div className="st-card"><span>Written</span><b>{tokenLabel(tokens.total.output)}</b><small>thinking and replies</small></div>
                    <div className="st-card"><span>Together</span><b>{tokenLabel(tokens.total.input + tokens.total.output)}</b><small>agy reports no price</small></div>
                  </div>
                  <ul className="st-list">
                    {tokens.days.filter((d) => d.input + d.output > 0).reverse().map((d) => (
                      <li key={d.date}>
                        <b>{dayLabel(d.date)}</b>
                        <span>{tokenLabel(d.input)} read · {tokenLabel(d.output)} written</span>
                        <b>{tokenLabel(d.input + d.output)}</b>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <p className="st-note">agy reports its limits and token counts but no price, so there are no dollar figures for it. Its work is not counted in the dollar costs of other providers.</p>
            </section>
          )}
          {view === 'claude' && (<>
          <p className="st-note">Costs are the figures Claude reports for each agent. The history is kept on this computer, from when the app first recorded it.</p>
          <div className="st-cards three">
            <div className="st-card"><span>Today</span><b>{money(r.today)}</b></div>
            <div className="st-card"><span>Last 7 days</span><b>{money(r.last7)}</b></div>
            <div className="st-card"><span>Last {days} days</span><b>{money(r.total)}</b></div>
          </div>
          <section>
            <div className="st-row">
              <h3>Daily cost</h3>
              <span className="st-seg" role="group" aria-label="Range">
                {RANGES.map((n) => (
                  <button key={n} aria-pressed={days === n} className={days === n ? 'on' : ''} onClick={() => setDays(n)}>{n}d</button>
                ))}
              </span>
            </div>
            <Bars label="Daily cost" rows={r.days.map((d, i) => ({ label: days <= 7 || (r.days.length - 1 - i) % Math.ceil(days / 5) === 0 ? d.date.slice(5) : '', full: dayLabel(d.date), value: d.usd }))} show={money} />
          </section>
          <section>
            <h3>Cost by model</h3>
            {r.byModel.length === 0 ? <p className="st-note">No spending recorded yet.</p> : r.byModel.map((m) => (
              <div key={m.model} className="st-model">
                <span>{m.model}</span>
                <i><b style={{ width: `${(m.usd / r.total) * 100}%` }} /></i>
                <span>{money(m.usd)}</span>
              </div>
            ))}
          </section>
          <section>
            <h3>Daily usage &amp; cost</h3>
            {spent.length === 0 ? <p className="st-note">Nothing yet.</p> : (
              <ul className="st-list">
                {spent.map((d) => (
                  <li key={d.date}>
                    <b>{dayLabel(d.date)}</b>
                    <span>{Object.keys(d.byModel).join(', ')}</span>
                    <b>{money(d.usd)}</b>
                  </li>
                ))}
              </ul>
            )}
          </section>
          </>)}
          <p className="st-note">Updated {new Date(at).toLocaleTimeString()}</p>
        </div>
      )}
    </Modal>
  )
}
