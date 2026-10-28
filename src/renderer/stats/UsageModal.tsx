import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { acctKey, type Overview, type OverviewAccount, type Spend } from '../../shared/ledger'
import { LOW_PCT, busiest, runsOutIn, weekElapsed } from '../../shared/limits'
import { tokenLabel, untilReset } from '../../shared/usage'
import { cssColor } from '../../shared/brand'
import { isProviderId, type LimitWindow, type Prefs, type ProviderId, type ProviderInfo } from '../../shared/types'
import { ProviderLogo } from '../panel/ProviderLogo'
import { ProviderTag } from '../panel/ProviderTag'
import { Modal } from '../panel/Modal'
import { AcctName, acctViews, type AcctView } from './acct'
import type { TokenMix } from '../../shared/tokenMix'
import { TokensTab } from './TokensTab'

const money = (n: number) => `$${n.toFixed(2)}`
const RANGES = [7, 30, 90]
const dayLabel = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
const KIND = { five_hour: '5-hour', weekly: 'weekly' } as const
const level = (pct: number) => (pct < LOW_PCT ? 'hot' : pct < 30 ? 'warn' : 'ok')
const left = (w: LimitWindow, now: number) => `${Math.round(w.remainingPct)}% left · resets in ${untilReset(Date.parse(w.resetsAt), now)}`
const ago = (ms: number) => (ms < 90_000 ? `${Math.max(1, Math.round(ms / 1000))}s ago` : `${Math.round(ms / 60_000)} min ago`)
const colorOf = (id: string) => (isProviderId(id) ? cssColor(id) : 'var(--muted)')
/** Dollars, with a ~ when some of it is an estimate from tokens rather than a price the program reported. */
const dollars = (s: Spend) => `${(s.est ?? 0) > 0 ? '~' : ''}${money(s.usd)}`
/** Both measures every program has: dollars and tokens. */
const spendText = (s: Spend) => (s.usd > 0 && s.tokens > 0 ? `${dollars(s)} · ${tokenLabel(s.tokens)}` : s.usd > 0 ? dollars(s) : s.tokens > 0 ? tokenLabel(s.tokens) : '—')
const weight = (s: Spend) => s.usd * 1e6 + s.tokens
const none = (): Spend => ({ usd: 0, tokens: 0 })
const sumOf = (list: Spend[]): Spend => list.reduce<Spend>((n, s) => ({ usd: n.usd + s.usd, tokens: n.tokens + s.tokens, ...((n.est ?? 0) + (s.est ?? 0) > 0 && { est: (n.est ?? 0) + (s.est ?? 0) }) }), none())
const winKey = (w: LimitWindow) => acctKey(w.provider, w.account)

type Tab = 'all' | 'accounts' | 'providers' | 'projects' | 'tokens'
type Metric = 'usd' | 'tokens'
type Scope = 'all' | string

/** One allowance as a bar of what is left; a weekly one carries a mark where an even pace would be by now. */
function Allowance({ w, now, name }: { w: LimitWindow; now: number; name: string }) {
  return (
    <div className="lm-row" data-level={level(w.remainingPct)}>
      <b>{name}</b>
      <i className="lm-bar" role="img" aria-label={`${Math.round(w.remainingPct)}% left`}>
        <b style={{ width: `${Math.min(100, Math.max(0, w.remainingPct))}%` }} />
        {w.kind === 'weekly' && <u className="lm-pace" style={{ left: `${(1 - weekElapsed(w, now)) * 100}%` }} title="Where an even pace would have it by now" />}
      </i>
      <small>{left(w, now)}</small>
    </div>
  )
}

/** The allowances of one account (or of every account of a program, side by side), grouped by what they limit. */
function WindowRows({ windows, now }: { windows: LimitWindow[]; now: number }) {
  const groups = [...new Set(windows.map((w) => w.group))]
  if (windows.length === 0) return <p className="st-note">No limits reported yet.</p>
  return (
    <>
      {groups.map((g) => (
        <div key={g} className="lm-group">
          {groups.length > 1 && <small>{g}</small>}
          {windows.filter((w) => w.group === g).sort((x, y) => (x.kind === y.kind ? 0 : x.kind === 'five_hour' ? -1 : 1)).map((w) => <Allowance key={`${w.group}${w.kind}`} w={w} now={now} name={KIND[w.kind]} />)}
        </div>
      ))}
    </>
  )
}

/** An account's own card: who it is, which program, and its allowances. */
function AccountCard({ v, windows, providers, now, onOpen }: { v: AcctView; windows: LimitWindow[]; providers: ProviderInfo[]; now: number; onOpen?: () => void }) {
  const mine = windows.filter((w) => winKey(w) === v.key)
  return (
    <div className="st-acct" style={{ ['--c' as string]: v.color }}>
      <header>
        <AcctName v={v} size={16} />
        <small>{providers.find((p) => p.id === v.provider)?.label ?? v.provider}</small>
        {onOpen && <button className="st-link" onClick={onOpen} aria-label={`Open ${v.name}`}>›</button>}
      </header>
      <WindowRows windows={mine} now={now} />
    </div>
  )
}

/** Days across, one stack per day split by account; each part says its own value to a screen reader and on hover. */
function Stacked({ o, keys, view, metric, days }: { o: Overview; keys: string[]; view: (k: string) => AcctView | undefined; metric: Metric; days: number }) {
  const parts = (d: Overview['days'][number]) => keys.map((k) => [k, d.byAccount[k]?.[metric] ?? 0] as const).filter(([, n]) => n > 0)
  const total = (d: Overview['days'][number]) => parts(d).reduce((n, [, x]) => n + x, 0)
  const max = Math.max(...o.days.map(total), 0)
  const show = (n: number) => (metric === 'usd' ? money(n) : tokenLabel(n))
  const every = Math.ceil(days / 5)
  return (
    <div className="st-bars" role="img" aria-label={`Daily ${metric === 'usd' ? 'spend' : 'tokens'}: ${o.days.map((d) => `${d.date} ${show(total(d))}`).join(', ')}`}>
      <span className="st-axis">{max > 0 ? show(max) : ''}</span>
      {o.days.map((d, i) => {
        const t = total(d)
        const tip = `${dayLabel(d.date)}: ${show(t)}${parts(d).map(([k, n]) => ` · ${view(k)?.name ?? k} ${show(n)}`).join('')}`
        return (
          <div key={d.date} className="st-col st-stack" tabIndex={0} data-tip={tip}>
            <div style={{ height: `${max > 0 ? Math.max(t > 0 ? 3 : 0, (t / max) * 100) : 0}%` }}>
              {parts(d).map(([k, n]) => <i key={k} style={{ flex: n, background: view(k)?.color ?? 'var(--muted)' }} />)}
            </div>
            <small>{days <= 7 || (o.days.length - 1 - i) % every === 0 ? d.date.slice(5) : ''}</small>
          </div>
        )
      })}
    </div>
  )
}

/** A bar split by account, for a project's or a program's share. */
function Split({ by, of, view }: { by: Record<string, Spend>; of: number; view: (k: string) => AcctView | undefined }) {
  return (
    <i className="st-split" aria-hidden="true">
      {Object.entries(by).filter(([, s]) => weight(s) > 0).map(([k, s]) => <b key={k} style={{ width: `${(weight(s) / of) * 100}%`, background: view(k)?.color ?? 'var(--muted)' }} />)}
    </i>
  )
}

/** A small line of how an account's spend went over the window. */
function Trend({ series, color }: { series: number[]; color: string }) {
  const m = Math.max(...series, 1)
  const w = 72
  const h = 22
  const pts = series.map((v, i) => `${(i * w) / Math.max(series.length - 1, 1)},${h - 2 - (v / m) * (h - 4)}`).join(' ')
  return (
    <svg className="st-trend" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={pts} />
    </svg>
  )
}

const share = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0)

/** A few plain sentences about what the numbers say, for whatever is in view. */
function insights(o: Overview, keys: string[], windows: LimitWindow[], view: (k: string) => AcctView | undefined, label: (p: string) => string, now: number): { tone: 'hot' | 'ok' | 'info'; text: ReactNode }[] {
  const out: { tone: 'hot' | 'ok' | 'info'; text: ReactNode }[] = []
  const weekly = windows.filter((w) => w.kind === 'weekly' && keys.includes(winKey(w)))
  const tight = weekly.reduce<LimitWindow | null>((a, b) => (!a || b.remainingPct < a.remainingPct ? b : a), null)
  if (tight) {
    const name = view(winKey(tight))?.name ?? tight.group
    const runs = runsOutIn(tight, now)
    const spare = weekly.filter((w) => winKey(w) !== winKey(tight)).reduce<LimitWindow | null>((a, b) => (!a || b.remainingPct > a.remainingPct ? b : a), null)
    out.push({
      tone: runs !== null || tight.remainingPct < LOW_PCT ? 'hot' : 'info',
      text: (
        <>
          <b>{name}</b> {runs !== null ? <>runs out of its weekly allowance in about {untilReset(now + runs, now)} at this pace, before it resets.</> : <>has {Math.round(tight.remainingPct)}% of its week left.</>}
          {spare && <> <b>{view(winKey(spare))?.name}</b> has {Math.round(spare.remainingPct)}% spare.</>}
        </>
      )
    })
  }
  const accts = o.accounts.filter((a) => keys.includes(a.key))
  const models = new Map<string, { provider: string; s: Spend }>()
  for (const a of accts) for (const m of a.models) models.set(`${a.provider}\n${m.model}`, { provider: a.provider, s: sumOf([models.get(`${a.provider}\n${m.model}`)?.s ?? none(), m]) })
  const ranked = [...models].sort((x, y) => weight(y[1].s) - weight(x[1].s))
  const all = sumOf(ranked.map((r) => r[1].s))
  if (ranked.length > 1) {
    const [k, v] = ranked[0]!
    const m = k.slice(k.indexOf('\n') + 1)
    const metric = all.usd > 0 ? 'usd' : 'tokens'
    out.push({ tone: 'info', text: <><b>{m}</b> is {share(v.s[metric], all[metric])}% of the {metric === 'usd' ? 'spend' : 'tokens'} ({label(v.provider)}).</> })
  }
  const projects = o.projects.map((p) => ({ p, s: sumOf(keys.map((k) => p.byAccount[k] ?? none())) })).filter((x) => weight(x.s) > 0).sort((x, y) => weight(y.s) - weight(x.s))
  if (projects[0]) {
    const { p, s } = projects[0]
    const by = Object.entries(p.byAccount).filter(([k]) => keys.includes(k)).sort((x, y) => weight(y[1]) - weight(x[1]))
    const metric = s.usd > 0 ? 'usd' : 'tokens'
    out.push({
      tone: 'ok',
      text: by.length > 1 ? <>Busiest project <b>{p.project}</b> used {by.length} accounts; {share(by[0]![1][metric], s[metric])}% of it ran on <b>{view(by[0]![0])?.name}</b>.</> : <>Busiest project <b>{p.project}</b>, with {p.agents.length} {p.agents.length === 1 ? 'agent' : 'agents'}.</>
    })
  }
  return out
}

/** What the agents have used, across every program, account, project and model, from the history the app keeps. */
export function UsageModal({
  providers,
  limits,
  limitsAt,
  accounts,
  own,
  office,
  onRefreshLimits,
  onClose
}: {
  providers: ProviderInfo[]
  /** The allowances the tanks already hold; nothing is asked again when this opens. */
  limits: LimitWindow[]
  limitsAt: number
  /** The extra accounts from Settings, to name the accounts behind each allowance and each share of the spend. */
  accounts: Prefs['accounts']
  /** The names given to the programs' own logins. */
  own?: Prefs['ownNames']
  office: { agents: number; projects: number }
  onRefreshLimits: () => Promise<void>
  onClose: () => void
}) {
  const [days, setDays] = useState(30)
  const [tab, setTab] = useState<Tab>('all')
  const [scope, setScope] = useState<Scope>('all')
  const [metric, setMetric] = useState<Metric>('usd')
  const [open, setOpen] = useState<ProviderId | null>(null)
  const [focus, setFocus] = useState<string | null>(null)
  const [o, setO] = useState<Overview | null>(null)
  const [mix, setMix] = useState<TokenMix | null>(null)
  const [now, setNow] = useState(Date.now())
  const [checking, setChecking] = useState(false)
  const load = useCallback(() => void window.aw.overview(days).then((x) => (setO(x), setNow(Date.now()))), [days])
  useEffect(load, [load])
  const loadMix = useCallback(() => void window.aw.tokenMix(days, scope === 'all' ? undefined : scope).then(setMix), [days, scope])
  useEffect(loadMix, [loadMix])
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(t)
  }, [])
  const refresh = () => {
    setChecking(true)
    load()
    loadMix()
    void onRefreshLimits().finally(() => (setChecking(false), setNow(Date.now())))
  }
  const views = useMemo(() => acctViews(providers, accounts, [...(o?.accounts ?? []), ...limits.map((w) => ({ provider: w.provider, account: w.account ?? '' }))], own), [providers, accounts, o, limits])
  const view = (k: string) => views.find((v) => v.key === k)
  const label = (id: string) => providers.find((p) => p.id === id)?.label ?? id
  const spendOf = (k: string): OverviewAccount | undefined => o?.accounts.find((a) => a.key === k)
  // Accounts with something to show come first, then the ones with nothing yet, so a quiet account never hides a busy one.
  const ordered = useMemo(() => [...views].sort((a, b) => weight(o?.accounts.find((x) => x.key === b.key) ?? none()) - weight(o?.accounts.find((x) => x.key === a.key) ?? none())), [views, o])
  const keys = scope === 'all' || !view(scope) ? ordered.map((v) => v.key) : [scope]
  const scoped = keys.length === 1 && scope !== 'all'
  const chosen = scoped ? view(scope) : undefined
  const total = sumOf(keys.map((k) => spendOf(k) ?? none()))
  const inScope = limits.filter((w) => keys.includes(winKey(w)))
  const tight = busiest(inScope)
  const change = useMemo(() => {
    if (!o || scope !== 'all' || weight(o.before) === 0) return null
    const pct = Math.round(((weight(o.total) - weight(o.before)) / weight(o.before)) * 100)
    return `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)}% vs the ${days} days before`
  }, [o, days, scope])
  const modelsOf = (id: string) => o?.models.filter((m) => m.provider === id) ?? []
  const projectsIn = (o?.projects ?? []).map((p) => ({ p, s: sumOf(keys.map((k) => p.byAccount[k] ?? none())) })).filter((x) => weight(x.s) > 0 || scope === 'all')
  const maxTop = Math.max(...projectsIn.map((x) => weight(x.s)), 1)
  const said = o ? insights(o, keys, limits, view, label, now) : []
  const detail = view(focus ?? '') ?? ordered.find((v) => spendOf(v.key)) ?? ordered[0]

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
      <div className="st-scope" role="group" aria-label="Show">
        <span className="st-lbl">Showing</span>
        <button className={scope === 'all' ? 'on' : ''} aria-pressed={scope === 'all'} onClick={() => setScope('all')}><i className="acct-dot" style={{ background: 'var(--accent)' }} />All</button>
        {ordered.map((v) => (
          <button key={v.key} className={scope === v.key ? 'on' : ''} aria-pressed={scope === v.key} onClick={() => setScope(v.key)} title={`${v.name} · ${label(v.provider)}`}>
            <AcctName v={v} />
          </button>
        ))}
        <span className="st-seg" role="group" aria-label="Range">
          {RANGES.map((n) => <button key={n} aria-pressed={days === n} className={days === n ? 'on' : ''} onClick={() => setDays(n)}>{n}d</button>)}
        </span>
      </div>
      <div className="st-tabs" role="tablist" aria-label="Usage view">
        {(['all', 'accounts', 'providers', 'projects', 'tokens'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => (setTab(t), setOpen(null))}>
            {{ all: 'Overview', accounts: 'Accounts', providers: 'Providers', projects: 'Projects', tokens: 'Tokens' }[t]}
          </button>
        ))}
      </div>
      {!o ? (
        <p className="st-note">Loading…</p>
      ) : (
        <div className="st-body">
          {tab === 'all' && (
            <>
              <div className="st-cards five">
                <div className="st-card"><span>Spent, {days} days</span><b>{dollars(total)}</b><small>{change ?? (scoped ? chosen?.name : '~ marks dollars worked out from tokens')}</small></div>
                <div className="st-card"><span>Tokens, {days} days</span><b>{tokenLabel(total.tokens)}</b><small>read and written{scoped ? '' : ', by every program'}</small></div>
                <div className="st-card"><span>Served from cache</span><b>{mix && mix.total.share !== null ? `${Math.round(mix.total.share * 100)}%` : '—'}</b><small>{mix && mix.total.share !== null ? 'of what the agents read, counted exactly' : 'not reported yet'}</small></div>
                <div className="st-card" data-level={tight ? level(tight.remainingPct) : undefined}>
                  <span>Tightest limit</span>
                  <b>{tight ? `${Math.round(tight.remainingPct)}% left` : '—'}</b>
                  <small>{tight ? `${tight.group}${views.length > 1 ? ` on ${view(winKey(tight))?.name}` : ''}, ${KIND[tight.kind]}, resets in ${untilReset(Date.parse(tight.resetsAt), now)}` : 'No limits reported yet'}</small>
                </div>
                <div className="st-card"><span>This month</span><b>{o.month.projected.usd > 0 ? `~${money(o.month.projected.usd)}` : o.month.projected.tokens > 0 ? tokenLabel(o.month.projected.tokens) : '—'}</b><small>at today's pace · day {o.month.day} of {o.month.of} · all accounts</small></div>
              </div>
              {said.length > 0 && (
                <div className="st-insights">
                  {said.map((x, i) => <p key={i} className="st-insight" data-tone={x.tone}>{x.text}</p>)}
                </div>
              )}
              {/* Boxes flow down two balanced columns, so no corner is left empty. */}
              <div className="st-masonry">
                <section>
                  <div className="st-row">
                    <h3>Daily {metric === 'usd' ? 'spend' : 'tokens'} <span className="lm-hint">by account</span></h3>
                    <span className="st-seg" role="group" aria-label="Measure">
                      <button aria-pressed={metric === 'usd'} className={metric === 'usd' ? 'on' : ''} onClick={() => setMetric('usd')}>$</button>
                      <button aria-pressed={metric === 'tokens'} className={metric === 'tokens' ? 'on' : ''} onClick={() => setMetric('tokens')}>Tokens</button>
                    </span>
                  </div>
                  <Stacked o={o} keys={keys} view={view} metric={metric} days={days} />
                  <div className="st-legend">
                    {keys.map((k) => view(k) && <span key={k}><AcctName v={view(k)!} size={12} /> {spendText(spendOf(k) ?? none())}</span>)}
                  </div>
                </section>
                <section>
                  <h3>By account <span className="lm-hint">the same spend, who made it</span></h3>
                  {keys.every((k) => weight(spendOf(k) ?? none()) === 0) ? <p className="st-note">Nothing recorded in this time.</p> : (
                    <>
                      <Split by={Object.fromEntries(keys.map((k) => [k, spendOf(k) ?? none()]))} of={Math.max(weight(total), 1)} view={view} />
                      {keys.filter((k) => view(k) && weight(spendOf(k) ?? none()) > 0).map((k) => {
                        const a = spendOf(k)!
                        return (
                          <div key={k} className="st-rank two">
                            <div><b><AcctName v={view(k)!} /></b><small>{weight(a.today) > 0 ? `${spendText(a.today)} today` : 'nothing today'}</small></div>
                            <span className="amt">{spendText(a)}{a.usd > 0 && total.usd > 0 && <small> {share(a.usd, total.usd)}%</small>}</span>
                          </div>
                        )
                      })}
                    </>
                  )}
                </section>
                <section>
                  <h3>Limits by account <span className="lm-hint">read from the tanks, no extra fetch</span></h3>
                  {keys.length === 0 || inScope.length === 0 ? <p className="st-note">No limits reported yet.</p> : (
                    <div className="st-accts">
                      {keys.map((k) => view(k) && inScope.some((w) => winKey(w) === k) && <AccountCard key={k} v={view(k)!} windows={inScope} providers={providers} now={now} onOpen={() => (setFocus(k), setTab('accounts'))} />)}
                    </div>
                  )}
                </section>
                <section>
                  <div className="st-row"><h3>Top projects</h3><button className="st-link" onClick={() => setTab('projects')}>All projects ›</button></div>
                  {projectsIn.length === 0 ? <p className="st-note">Nothing recorded in this time.</p> : [...projectsIn].sort((a, b) => weight(b.s) - weight(a.s)).slice(0, 4).map(({ p, s }, i) => (
                    <div key={p.project} className="st-rank">
                      <span className="n">{i + 1}</span>
                      <div><b>{p.project}</b><small>{p.agents.length} {p.agents.length === 1 ? 'agent' : 'agents'} · {ago(now - p.lastAt)}</small></div>
                      <Split by={Object.fromEntries(keys.map((k) => [k, p.byAccount[k] ?? none()]))} of={maxTop} view={view} />
                      <span className="amt">{spendText(s)}</span>
                    </div>
                  ))}
                </section>
                <section>
                  <h3>By model</h3>
                  {o.models.filter((m) => keys.some((k) => spendOf(k)?.models.some((x) => x.model === m.model && spendOf(k)?.provider === m.provider))).length === 0 ? <p className="st-note">Nothing recorded in this time.</p> : o.models.filter((m) => keys.some((k) => spendOf(k)?.provider === m.provider && spendOf(k)?.models.some((x) => x.model === m.model))).slice(0, 6).map((m) => (
                    <div key={m.provider + m.model} className="st-rank two">
                      <div><b>{m.model}</b><small><ProviderLogo id={m.provider as ProviderId} size={11} tint /> {label(m.provider)}</small></div>
                      <span className="amt">{spendText(m)}</span>
                    </div>
                  ))}
                </section>
              </div>
            </>
          )}

          {tab === 'tokens' && (mix ? <TokensTab mix={mix} days={days} providers={providers} view={view} /> : <p className="st-note">Loading…</p>)}

          {tab === 'accounts' && (
            <>
              <section>
                <h3>Accounts side by side <span className="lm-hint">click a row to open it</span></h3>
                <table className="st-table st-acct-table">
                  <thead><tr><th>Account</th><th>Spent</th><th>Tokens</th><th>Turns</th><th>Agents</th><th>Top model</th><th>Weekly left</th><th>Trend</th></tr></thead>
                  <tbody>
                    {ordered.map((v) => {
                      const a = spendOf(v.key)
                      const wk = limits.filter((w) => winKey(w) === v.key && w.kind === 'weekly').reduce<LimitWindow | null>((x, y) => (!x || y.remainingPct < x.remainingPct ? y : x), null)
                      return (
                        <tr key={v.key} className={detail?.key === v.key ? 'on' : ''} onClick={() => setFocus(v.key)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setFocus(v.key)} aria-selected={detail?.key === v.key}>
                          <td><AcctName v={v} /></td>
                          <td>{a && a.usd > 0 ? dollars(a) : '—'}</td>
                          <td>{a && a.tokens > 0 ? tokenLabel(a.tokens) : '—'}</td>
                          <td>{a?.turns ?? 0}</td>
                          <td>{a?.agents ?? 0}</td>
                          <td>{a?.models[0]?.model ?? '—'}</td>
                          <td data-level={wk ? level(wk.remainingPct) : undefined}>{wk ? `${Math.round(wk.remainingPct)}%` : '—'}</td>
                          <td>{a ? <Trend series={a.series} color={v.color} /> : null}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </section>
              {detail && (
                <section className="st-detail" aria-label={`${detail.name} in detail`}>
                  <div className="st-row"><h3><AcctName v={detail} size={16} /> <span className="lm-hint">{label(detail.provider)}</span></h3></div>
                  <div className="st-two">
                    <div>
                      <Stacked o={o} keys={[detail.key]} view={view} metric={metric} days={days} />
                    </div>
                    <AccountCard v={detail} windows={limits} providers={providers} now={now} />
                  </div>
                  <div className="st-three">
                    <div><h4>Models</h4>{(spendOf(detail.key)?.models ?? []).slice(0, 4).map((m) => <div key={m.model} className="st-rank two"><div><b>{m.model}</b></div><span className="amt">{spendText(m)}</span></div>)}</div>
                    <div><h4>Projects</h4>{(spendOf(detail.key)?.projects ?? []).slice(0, 4).map((m) => <div key={m.project} className="st-rank two"><div><b>{m.project}</b></div><span className="amt">{spendText(m)}</span></div>)}</div>
                    <div><h4>Agents</h4>{(spendOf(detail.key)?.agentUse ?? []).slice(0, 4).map((m) => <div key={m.agent} className="st-rank two"><div><b>{m.name}</b><small>{m.turns} {m.turns === 1 ? 'turn' : 'turns'}</small></div><span className="amt">{spendText(m)}</span></div>)}</div>
                  </div>
                  {!spendOf(detail.key) && <p className="st-note">Nothing recorded on this account in this time.</p>}
                </section>
              )}
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
                  const n = views.filter((v) => v.provider === p.id).length
                  return (
                    <button key={p.id} className="st-pcard" style={{ ['--c' as string]: colorOf(p.id) }} onClick={() => setOpen(p.id)} aria-label={`Open ${p.label}`}>
                      <span className="top"><ProviderLogo id={p.id} size={18} tint /><ProviderTag id={p.id} label={p.label} /><small>{n > 1 ? `${n} accounts` : (mine?.usd ?? 0) > 0 ? 'reports dollars' : (mine?.tokens ?? 0) > 0 ? 'reports tokens' : 'nothing yet'}</small><span className="go" aria-hidden="true">›</span></span>
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
                      <tr><td>Spent</td>{o.providers.map((p) => <td key={p.provider}>{p.usd > 0 ? dollars(p) : '—'}</td>)}<td><b>{dollars(o.total)}</b></td></tr>
                      <tr><td>Tokens</td>{o.providers.map((p) => <td key={p.provider}>{p.tokens > 0 ? tokenLabel(p.tokens) : '—'}</td>)}<td><b>{tokenLabel(o.total.tokens)}</b></td></tr>
                      <tr><td>Tightest limit</td>{o.providers.map((p) => { const t = busiest(limits.filter((w) => w.provider === p.provider)); return <td key={p.provider}>{t ? `${Math.round(t.remainingPct)}% left` : '—'}</td> })}<td><b>{busiest(limits) ? `${Math.round(busiest(limits)!.remainingPct)}% left` : '—'}</b></td></tr>
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
                <ProviderLogo id={open} size={18} tint />
                <ProviderTag id={open} label={label(open)} />
              </div>
              <section>
                <h3>Accounts</h3>
                <div className="st-accts">
                  {views.filter((v) => v.provider === open).map((v) => <AccountCard key={v.key} v={v} windows={limits} providers={providers} now={now} onOpen={() => (setFocus(v.key), setTab('accounts'))} />)}
                </div>
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
                <h3>Projects <span className="lm-hint">the bar is split by account; open a row for who worked there</span></h3>
                {projectsIn.length === 0 ? <p className="st-note">Nothing recorded in this time.</p> : [...projectsIn].sort((a, b) => weight(b.s) - weight(a.s)).map(({ p, s }, i) => (
                  <details key={p.project} className="st-proj" open={i === 0}>
                    <summary>
                      <span className="n">{i + 1}</span>
                      <span className="nm"><b>{p.project}</b><small>{ago(now - p.lastAt)}</small></span>
                      <Split by={Object.fromEntries(keys.map((k) => [k, p.byAccount[k] ?? none()]))} of={maxTop} view={view} />
                      <span className="share">{weight(total) ? Math.round((weight(s) / weight(total)) * 100) : 0}%</span>
                      <span className="amt">{spendText(s)}</span>
                    </summary>
                    <div className="st-agents">
                      {p.agents.filter((a) => keys.includes(acctKey(a.provider, a.account))).map((a) => (
                        <div key={a.agent} className="st-rank two">
                          <div><b>{a.name}</b> {view(acctKey(a.provider, a.account)) && <AcctName v={view(acctKey(a.provider, a.account))!} size={12} />}<small>{a.model} · {a.turns} {a.turns === 1 ? 'turn' : 'turns'}</small></div>
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
          <p className="st-note">Costs are the figures each program reports; a program that reports tokens only is shown in tokens, with dollars worked out from them (~). {office.agents} {office.agents === 1 ? 'agent' : 'agents'} on {office.projects} {office.projects === 1 ? 'project' : 'projects'} now. The history is kept on this computer.</p>
        </div>
      )}
    </Modal>
  )
}
