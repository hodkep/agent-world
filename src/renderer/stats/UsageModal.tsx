import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Overview, Spend } from '../../shared/ledger'
import { LOW_PCT, busiest } from '../../shared/limits'
import { tokenLabel, untilReset } from '../../shared/usage'
import { cssColor } from '../../shared/brand'
import { isProviderId, type LimitWindow, type Prefs, type ProviderId, type ProviderInfo } from '../../shared/types'
import { accountColor, accountName } from '../accounts'
import { ProviderTag } from '../panel/ProviderTag'
import { Modal } from '../panel/Modal'

const money = (n: number) => `$${n.toFixed(2)}`
const RANGES = [7, 30, 90]
const dayLabel = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
const KIND = { five_hour: '5-hour', weekly: 'weekly' } as const
const level = (pct: number) => (pct < LOW_PCT ? 'hot' : pct < 30 ? 'warn' : 'ok')
const left = (w: LimitWindow, now: number) => `${Math.round(w.remainingPct)}% left · resets in ${untilReset(Date.parse(w.resetsAt), now)}`
const ago = (ms: number) => (ms < 90_000 ? `${Math.max(1, Math.round(ms / 1000))}s ago` : `${Math.round(ms / 60_000)} min ago`)
const colorOf = (id: string) => (isProviderId(id) ? cssColor(id) : 'var(--muted)')
/** A program reports dollars, tokens or neither; say whichever it reports. */
const spendText = (s: Spend) => (s.usd > 0 && s.tokens > 0 ? `${money(s.usd)} · ${tokenLabel(s.tokens)}` : s.usd > 0 ? money(s.usd) : s.tokens > 0 ? tokenLabel(s.tokens) : '—')
const weight = (s: Spend) => s.usd * 1e6 + s.tokens

type Tab = 'all' | 'providers' | 'projects'
type Metric = 'usd' | 'tokens'

/** One allowance as a bar of what is left. */
function Allowance({ w, now, name }: { w: LimitWindow; now: number; name: string }) {
  return (
    <div className="lm-row" data-level={level(w.remainingPct)}>
      <b>{name}</b>
      <i className="lm-bar" role="img" aria-label={`${Math.round(w.remainingPct)}% left`}><b style={{ width: `${Math.min(100, Math.max(0, w.remainingPct))}%` }} /></i>
      <small>{left(w, now)}</small>
    </div>
  )
}

/** Every allowance the programs report, grouped under the program's tag. Read from what the tanks already hold. */
function Limits({ windows, providers, accounts, now }: { windows: LimitWindow[]; providers: ProviderInfo[]; accounts: Prefs['accounts']; now: number }) {
  const ids = [...new Set(windows.map((w) => w.provider))]
  if (ids.length === 0) return <p className="st-note">No limits reported yet.</p>
  return (
    <>
      {ids.map((id) => {
        const mine = windows.filter((w) => w.provider === id)
        const groups = [...new Set(mine.map((w) => w.group))]
        // A program with several logins has allowances for each, side by side; the header shows the tightest of them.
        const logins = [...new Set(mine.map((w) => w.account ?? ''))]
        return (
          <div key={id} className="lm-prov">
            <ProviderTag id={id} label={providers.find((p) => p.id === id)?.label} />
            {logins.map((ac) => (
              <div key={ac} className="lm-login">
                {logins.length > 1 && <small className="lm-acct"><i className="acct-dot" style={{ background: accountColor(accounts, ac) }} />{accountName(accounts, ac)}</small>}
                {groups.map((g) => (
                  <div key={g} className="lm-group">
                    {groups.length > 1 && <small>{g}</small>}
                    {mine.filter((w) => w.group === g && (w.account ?? '') === ac).map((w) => <Allowance key={w.kind} w={w} now={now} name={KIND[w.kind]} />)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )
      })}
    </>
  )
}

/** Days across, one stack per day split by program; each part says its own value to a screen reader and on hover. */
function Stacked({ o, metric, days }: { o: Overview; metric: Metric; days: number }) {
  const total = (d: Overview['days'][number]) => Object.values(d.by).reduce((n, s) => n + s[metric], 0)
  const max = Math.max(...o.days.map(total), 0)
  const show = (n: number) => (metric === 'usd' ? money(n) : tokenLabel(n))
  const every = Math.ceil(days / 5)
  return (
    <div className="st-bars" role="img" aria-label={`Daily ${metric === 'usd' ? 'spend' : 'tokens'}: ${o.days.map((d) => `${d.date} ${show(total(d))}`).join(', ')}`}>
      <span className="st-axis">{max > 0 ? show(max) : ''}</span>
      {o.days.map((d, i) => {
        const t = total(d)
        const tip = `${dayLabel(d.date)}: ${show(t)}${Object.entries(d.by).filter(([, s]) => s[metric] > 0).map(([p, s]) => ` · ${p} ${show(s[metric])}`).join('')}`
        return (
          <div key={d.date} className="st-col st-stack" tabIndex={0} data-tip={tip}>
            <div style={{ height: `${max > 0 ? Math.max(t > 0 ? 3 : 0, (t / max) * 100) : 0}%` }}>
              {Object.entries(d.by).filter(([, s]) => s[metric] > 0).map(([p, s]) => <i key={p} style={{ flex: s[metric], background: colorOf(p) }} />)}
            </div>
            <small>{days <= 7 || (o.days.length - 1 - i) % every === 0 ? d.date.slice(5) : ''}</small>
          </div>
        )
      })}
    </div>
  )
}

/** A bar split by program, for a project's or a program's share. */
function Split({ by, of }: { by: Record<string, Spend>; of: number }) {
  return (
    <i className="st-split" aria-hidden="true">
      {Object.entries(by).filter(([, s]) => weight(s) > 0).map(([p, s]) => <b key={p} style={{ width: `${(weight(s) / of) * 100}%`, background: colorOf(p) }} />)}
    </i>
  )
}

/** What the agents have used, across every program, project and model, from the history the app keeps. */
export function UsageModal({
  providers,
  limits,
  limitsAt,
  accounts,
  office,
  onRefreshLimits,
  onClose
}: {
  providers: ProviderInfo[]
  /** The allowances the tanks already hold; nothing is asked again when this opens. */
  limits: LimitWindow[]
  limitsAt: number
  /** The extra accounts from Settings, to name the logins behind each allowance and each share of the spend. */
  accounts: Prefs['accounts']
  office: { agents: number; projects: number }
  onRefreshLimits: () => Promise<void>
  onClose: () => void
}) {
  const [days, setDays] = useState(30)
  const [tab, setTab] = useState<Tab>('all')
  const [metric, setMetric] = useState<Metric>('usd')
  const [open, setOpen] = useState<ProviderId | null>(null)
  const [o, setO] = useState<Overview | null>(null)
  const [now, setNow] = useState(Date.now())
  const [checking, setChecking] = useState(false)
  const load = useCallback(() => void window.aw.overview(days).then((x) => (setO(x), setNow(Date.now()))), [days])
  useEffect(load, [load])
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(t)
  }, [])
  const refresh = () => {
    setChecking(true)
    load()
    void onRefreshLimits().finally(() => (setChecking(false), setNow(Date.now())))
  }
  const tight = busiest(limits)
  const label = (id: string) => providers.find((p) => p.id === id)?.label ?? id
  const change = useMemo(() => {
    if (!o || weight(o.before) === 0) return null
    const pct = Math.round(((weight(o.total) - weight(o.before)) / weight(o.before)) * 100)
    return `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)}% vs the ${days} days before`
  }, [o, days])
  const modelsOf = (id: string) => o?.models.filter((m) => m.provider === id) ?? []
  const maxTop = Math.max(...(o?.projects.map(weight) ?? []), 1)

  return (
    <Modal label="Usage and estimated costs" className="stats" onClose={onClose}>
      <header className="settings-head">
        <b>Usage &amp; Estimated Costs</b>
        <span className="st-nav">
          <span className="st-fresh" role="status"><i data-stale={now - limitsAt > 120_000} />limits {checking ? 'checking…' : `checked ${ago(now - limitsAt)}`}</span>
          <button onClick={refresh} disabled={checking} aria-label="Refresh" title="Check the limits again now">↻</button>
          <button onClick={onClose} aria-label="Close" title="Close">×</button>
        </span>
      </header>
      <div className="st-tabs" role="tablist" aria-label="Usage view">
        {(['all', 'providers', 'projects'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => (setTab(t), setOpen(null))}>
            {{ all: 'All', providers: 'Providers', projects: 'Projects' }[t]}
          </button>
        ))}
        <span className="st-seg" role="group" aria-label="Range">
          {RANGES.map((n) => <button key={n} aria-pressed={days === n} className={days === n ? 'on' : ''} onClick={() => setDays(n)}>{n}d</button>)}
        </span>
      </div>
      {!o ? (
        <p className="st-note">Loading…</p>
      ) : (
        <div className="st-body">
          {tab === 'all' && (
            <>
              <div className="st-cards four">
                <div className="st-card"><span>Spent, {days} days</span><b>{money(o.total.usd)}</b><small>{change ?? 'Dollars, where a program reports a price'}</small></div>
                <div className="st-card"><span>Tokens, {days} days</span><b>{tokenLabel(o.total.tokens)}</b><small>from programs that count tokens, not dollars</small></div>
                <div className="st-card" data-level={tight ? level(tight.remainingPct) : undefined}>
                  <span>Tightest limit</span>
                  <b>{tight ? `${Math.round(tight.remainingPct)}% left` : '—'}</b>
                  <small>{tight ? `${tight.group}${accounts.length ? ` on ${accountName(accounts, tight.account)}` : ''}, ${KIND[tight.kind]}, resets in ${untilReset(Date.parse(tight.resetsAt), now)}` : 'No limits reported yet'}</small>
                </div>
                <div className="st-card"><span>In the office</span><b>{office.agents} {office.agents === 1 ? 'agent' : 'agents'}</b><small>{office.projects} {office.projects === 1 ? 'project' : 'projects'} · {providers.filter((p) => p.detection.state === 'ready').length} of {providers.length} programs ready</small></div>
              </div>
              <div className="st-two wide">
                <section>
                  <div className="st-row">
                    <h3>Daily {metric === 'usd' ? 'spend' : 'tokens'} <span className="lm-hint">by program</span></h3>
                    <span className="st-seg" role="group" aria-label="Measure">
                      <button aria-pressed={metric === 'usd'} className={metric === 'usd' ? 'on' : ''} onClick={() => setMetric('usd')}>$</button>
                      <button aria-pressed={metric === 'tokens'} className={metric === 'tokens' ? 'on' : ''} onClick={() => setMetric('tokens')}>Tokens</button>
                    </span>
                  </div>
                  <Stacked o={o} metric={metric} days={days} />
                  <div className="st-legend">
                    {o.providers.map((p) => <span key={p.provider}><i style={{ background: colorOf(p.provider) }} />{label(p.provider)} {spendText(p)}</span>)}
                  </div>
                </section>
                <section>
                  <h3>Limits <span className="lm-hint">live from the tanks</span></h3>
                  <Limits windows={limits} providers={providers} accounts={accounts} now={now} />
                </section>
              </div>
              {accounts.length > 0 && (
                <section>
                  <h3>By account <span className="lm-hint">the same spend, split by login</span></h3>
                  {o.accounts.length === 0 ? <p className="st-note">Nothing recorded in this time.</p> : o.accounts.map((a) => (
                    <div key={a.account} className="st-rank two">
                      <div><b><i className="acct-dot" style={{ background: accountColor(accounts, a.account) }} />{accountName(accounts, a.account)}</b><small>{a.today.usd > 0 || a.today.tokens > 0 ? `${spendText(a.today)} today` : 'nothing today'}</small></div>
                      <span className="amt">{spendText(a)}</span>
                    </div>
                  ))}
                </section>
              )}
              <div className="st-two wide">
                <section>
                  <div className="st-row"><h3>Top projects</h3><button className="st-link" onClick={() => setTab('projects')}>All projects ›</button></div>
                  {o.projects.length === 0 ? <p className="st-note">Nothing recorded in this time.</p> : o.projects.slice(0, 4).map((p, i) => (
                    <div key={p.project} className="st-rank">
                      <span className="n">{i + 1}</span>
                      <div><b>{p.project}</b><small>{p.agents.length} {p.agents.length === 1 ? 'agent' : 'agents'} · {ago(now - p.lastAt)}</small></div>
                      <Split by={p.by} of={maxTop} />
                      <span className="amt">{spendText(p)}</span>
                    </div>
                  ))}
                </section>
                <section>
                  <h3>By model</h3>
                  {o.models.length === 0 ? <p className="st-note">Nothing recorded in this time.</p> : o.models.slice(0, 6).map((m) => (
                    <div key={m.provider + m.model} className="st-rank two">
                      <div><b>{m.model}</b><small>{label(m.provider)}</small></div>
                      <span className="amt">{spendText(m)}</span>
                    </div>
                  ))}
                </section>
              </div>
            </>
          )}

          {tab === 'providers' && !open && (
            <>
              <div className="st-pgrid">
                {o.providers.length === 0 && providers.filter((p) => p.detection.state === 'ready').length === 0 && <p className="st-note">No program is connected yet.</p>}
                {providers.filter((p) => p.detection.state === 'ready' || o.providers.some((x) => x.provider === p.id)).map((p) => {
                  const mine = o.providers.find((x) => x.provider === p.id)
                  const w = limits.filter((x) => x.provider === p.id)
                  const tightP = busiest(w)
                  return (
                    <button key={p.id} className="st-pcard" style={{ ['--c' as string]: colorOf(p.id) }} onClick={() => setOpen(p.id)} aria-label={`Open ${p.label}`}>
                      <span className="top"><ProviderTag id={p.id} label={p.label} /><small>{(mine?.usd ?? 0) > 0 ? 'reports dollars' : (mine?.tokens ?? 0) > 0 ? 'reports tokens' : 'nothing yet'}</small><span className="go" aria-hidden="true">›</span></span>
                      <span className="big">
                        <span><b>{mine ? spendText(mine) : '—'}</b><small>{days} days</small></span>
                        <span><b>{mine ? spendText(mine.today) : '—'}</b><small>today</small></span>
                        <span><b>{tightP ? `${Math.round(tightP.remainingPct)}%` : '—'}</b><small>left{tightP ? `, ${KIND[tightP.kind]}` : ''}</small></span>
                      </span>
                      <span className="st-spark" aria-hidden="true">
                        {o.days.slice(-20).map((d) => {
                          const v = d.by[p.id] ? weight(d.by[p.id]!) : 0
                          const m = Math.max(...o.days.slice(-20).map((x) => (x.by[p.id] ? weight(x.by[p.id]!) : 0)), 1)
                          return <i key={d.date} style={{ height: `${Math.max(6, (v / m) * 100)}%` }} />
                        })}
                      </span>
                    </button>
                  )
                })}
              </div>
              {o.providers.length > 0 && (
                <section>
                  <h3>Side by side</h3>
                  <table className="st-table">
                    <thead><tr><th>Measure</th>{o.providers.map((p) => <th key={p.provider} style={{ color: colorOf(p.provider) }}>{label(p.provider)}</th>)}<th>Total</th></tr></thead>
                    <tbody>
                      <tr><td>Spent</td>{o.providers.map((p) => <td key={p.provider}>{p.usd > 0 ? money(p.usd) : '—'}</td>)}<td><b>{money(o.total.usd)}</b></td></tr>
                      <tr><td>Tokens</td>{o.providers.map((p) => <td key={p.provider}>{p.tokens > 0 ? tokenLabel(p.tokens) : '—'}</td>)}<td><b>{tokenLabel(o.total.tokens)}</b></td></tr>
                      <tr><td>Tightest limit</td>{o.providers.map((p) => { const t = busiest(limits.filter((w) => w.provider === p.provider)); return <td key={p.provider}>{t ? `${Math.round(t.remainingPct)}% left` : '—'}</td> })}<td><b>{tight ? `${Math.round(tight.remainingPct)}% left` : '—'}</b></td></tr>
                    </tbody>
                  </table>
                </section>
              )}
              <p className="st-note">A program added later appears here as another card.</p>
            </>
          )}

          {tab === 'providers' && open && (
            <>
              <div className="st-row lm-crumbs">
                <button onClick={() => setOpen(null)}>‹ All providers</button>
                <ProviderTag id={open} label={label(open)} />
              </div>
              <section>
                <h3>Limits</h3>
                <Limits windows={limits.filter((w) => w.provider === open)} providers={providers} accounts={accounts} now={now} />
              </section>
              <section>
                <h3>By model</h3>
                {modelsOf(open).length === 0 ? <p className="st-note">Nothing recorded in this time.</p> : modelsOf(open).map((m) => (
                  <div key={m.model} className="st-rank two"><div><b>{m.model}</b></div><span className="amt">{spendText(m)}</span></div>
                ))}
              </section>
              <section>
                <h3>By day</h3>
                {o.days.filter((d) => d.by[open] && weight(d.by[open]!) > 0).reverse().map((d) => (
                  <div key={d.date} className="st-rank two"><div><b>{dayLabel(d.date)}</b></div><span className="amt">{spendText(d.by[open]!)}</span></div>
                ))}
                {!o.days.some((d) => d.by[open] && weight(d.by[open]!) > 0) && <p className="st-note">Nothing recorded in this time.</p>}
              </section>
            </>
          )}

          {tab === 'projects' && (
            <>
              <section>
                <h3>Projects <span className="lm-hint">spend and who worked there</span></h3>
                {o.projects.length === 0 ? <p className="st-note">Nothing recorded in this time.</p> : o.projects.map((p, i) => (
                  <details key={p.project} className="st-proj" open={i === 0}>
                    <summary>
                      <span className="n">{i + 1}</span>
                      <span className="nm"><b>{p.project}</b><small>{ago(now - p.lastAt)}</small></span>
                      <Split by={p.by} of={maxTop} />
                      <span className="share">{weight(o.total) ? Math.round((weight(p) / weight(o.total)) * 100) : 0}%</span>
                      <span className="amt">{spendText(p)}</span>
                    </summary>
                    <div className="st-agents">
                      {p.agents.map((a) => (
                        <div key={a.agent} className="st-rank two">
                          <div><b>{a.name}</b> <ProviderTag id={isProviderId(a.provider) ? a.provider : undefined} label={label(a.provider)} /><small>{a.model} · {a.turns} {a.turns === 1 ? 'turn' : 'turns'}</small></div>
                          <span className="amt">{spendText(a)}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </section>
              <p className="st-note">An agent that has left the office stays in the totals under its last name, so the numbers never shrink.</p>
            </>
          )}
          <p className="st-note">Costs are the figures each program reports; a program that reports tokens only is shown in tokens. The history is kept on this computer.</p>
        </div>
      )}
    </Modal>
  )
}
