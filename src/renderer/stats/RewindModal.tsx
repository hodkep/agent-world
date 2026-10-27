import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { type WeekAccount, type WeekReport, weekStartOf } from '../../shared/ledger'
import type { Prefs, ProviderInfo } from '../../shared/types'
import { Modal } from '../panel/Modal'
import { durationLabel } from '../profile/format'
import { addParts, noParts, tokenChange, type TokenParts } from '../../shared/tokens'
import { tokenLabel } from '../../shared/usage'
import { Heat } from './charts'
import { MixBar } from './TokensTab'
import { AcctName, acctViews, type AcctView } from './acct'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const money = (n: number) => `$${n.toFixed(2)}`
const hour = (h: number) => `${h % 12 || 12}${h < 12 || h === 24 ? ' AM' : ' PM'}`
const range = (start: number) => {
  const a = new Date(start)
  const b = new Date(a.getFullYear(), a.getMonth(), a.getDate() + 6)
  const m = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `${m(a)} – ${m(b)}, ${b.getFullYear()}`
}
const when = (t: number) => new Date(t).toLocaleDateString(undefined, { weekday: 'short' })
type Tab = 'week' | 'accounts' | 'projects'

/** The change from the week before, as a short note; nothing when there was no week before to compare with. */
function change(now: number, before: number): { text: string; up: boolean; pct: number } | null {
  if (before <= 0) return null
  const pct = Math.round(((now - before) / before) * 100)
  return { text: `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)}%`, up: pct >= 0, pct }
}

/** The change in tokens, as `change` gives it for cost; last week counted the old way is compared without the cache, and the card says so. */
function tokenDelta(now: TokenParts, before: TokenParts): (ReturnType<typeof change> & { io: boolean }) | null {
  const c = tokenChange(now, before)
  return c ? { text: `${c.pct >= 0 ? '▲' : '▼'} ${Math.abs(c.pct)}%`, up: c.pct >= 0, pct: c.pct, io: c.basis === 'io' } : null
}

const sumParts = (list: TokenParts[]) => list.reduce((n, p) => (addParts(n, p), n), noParts())

function Card({ label, value, note, delta, bar }: { label: string; value: string; note?: ReactNode; delta?: ReturnType<typeof change>; bar?: ReactNode }) {
  return (
    <div className="st-card">
      <span>{label}</span>
      <b>{value}</b>
      <small>{delta && <i className="st-delta" data-up={delta.up}>{delta.text}</i>}{delta && note ? ' · ' : ''}{note}</small>
      {bar}
    </div>
  )
}

/** Each day of the week as a stack split by account, with the hours worked under it. */
function DayStack({ r, keys, view, measure }: { r: WeekReport; keys: string[]; view: (k: string) => AcctView | undefined; measure: 'usd' | 'tokens' }) {
  const of = (i: number) => (measure === 'usd' ? r.perDay[i]!.by : r.perDay[i]!.tokBy)
  const show = measure === 'usd' ? money : tokenLabel
  const tot = (i: number) => keys.reduce((n, k) => n + (of(i)[k] ?? 0), 0)
  const max = Math.max(...DAYS.map((_, i) => tot(i)), 0)
  return (
    <div className="st-bars" role="img" aria-label={`${measure === 'usd' ? 'Cost' : 'Tokens'} by day: ${DAYS.map((d, i) => `${d} ${show(tot(i))}`).join(', ')}`}>
      <span className="st-axis">{max > 0 ? show(max) : ''}</span>
      {DAYS.map((d, i) => {
        const parts = keys.map((k) => [k, of(i)[k] ?? 0] as const).filter(([, n]) => n > 0)
        const t = tot(i)
        const tip = `${d}: ${show(t)} · ${durationLabel(r.perDay[i]!.ms)}${parts.map(([k, n]) => ` · ${view(k)?.name ?? k} ${show(n)}`).join('')}`
        return (
          <div key={d} className="st-col st-stack" tabIndex={0} data-tip={tip}>
            <div style={{ height: `${max > 0 ? Math.max(t > 0 ? 3 : 0, (t / max) * 100) : 0}%` }}>
              {parts.map(([k, n]) => <i key={k} style={{ flex: n, background: view(k)?.color ?? 'var(--muted)' }} />)}
            </div>
            <small>{d.slice(0, 3)}{r.perDay[i]!.ms > 0 ? ` · ${durationLabel(r.perDay[i]!.ms)}` : ''}</small>
          </div>
        )
      })}
    </div>
  )
}

/** How full an account's weekly allowance was at the end of each day, as a line against the 95% mark. */
function LimitLine({ a, color }: { a: WeekAccount; color: string }) {
  const pts = a.weeklyDays.map((v, i) => (v === null ? null : `${(i * 200) / 6 + 5},${46 - (v / 100) * 42}`)).filter((p): p is string => p !== null)
  return (
    <svg className="st-limit-line" viewBox="0 0 210 50" preserveAspectRatio="none" role="img" aria-label={`Weekly allowance used: ${a.weeklyDays.map((v, i) => `${DAYS[i]} ${v ?? 'not looked at'}`).join(', ')}`}>
      <line x1="0" y1="8" x2="210" y2="8" stroke="var(--danger)" strokeDasharray="3 3" strokeWidth="1" />
      <polyline fill="none" stroke={color} strokeWidth="2" points={pts.join(' ')} />
    </svg>
  )
}

/** The week's work in numbers and charts, by account, from the history the app keeps. */
export function RewindModal({ providers, accounts, onClose }: { providers: ProviderInfo[]; accounts: Prefs['accounts']; onClose: () => void }) {
  const [start, setStart] = useState(() => weekStartOf(Date.now()))
  const [r, setR] = useState<WeekReport | null>(null)
  const [tab, setTab] = useState<Tab>('week')
  const [scope, setScope] = useState<string>('all')
  const [measure, setMeasure] = useState<'usd' | 'tokens'>('usd')
  useEffect(() => {
    let live = true
    void window.aw.weekReport(start).then((x) => live && setR(x))
    return () => {
      live = false
    }
  }, [start])
  const thisWeek = start >= weekStartOf(Date.now())
  const shift = (weeks: number) => setStart((s) => weekStartOf(new Date(s).setDate(new Date(s).getDate() + 7 * weeks + 1)))
  const views = useMemo(() => acctViews(providers, accounts, r?.accounts ?? []), [providers, accounts, r])
  const view = (k: string) => views.find((v) => v.key === k)
  const ordered = useMemo(() => [...views].sort((a, b) => (r?.accounts.find((x) => x.key === b.key)?.usd ?? 0) - (r?.accounts.find((x) => x.key === a.key)?.usd ?? 0)), [views, r])
  const keys = scope === 'all' || !view(scope) ? ordered.map((v) => v.key) : [scope]
  const whole = scope === 'all' || !view(scope)
  const mine = (r?.accounts ?? []).filter((a) => keys.includes(a.key))
  const sum = (f: (a: WeekAccount) => number) => mine.reduce((n, a) => n + f(a), 0)
  const cost = sum((a) => a.usd)
  const ms = sum((a) => a.ms)
  const turns = sum((a) => a.turns)
  const agentCount = sum((a) => a.agents)
  const mix = sumParts(mine.map((a) => a.mix))
  const tokDelta = tokenDelta(mix, sumParts(mine.map((a) => a.beforeMix)))
  const read = mix.input + mix.cacheRead + mix.cacheWrite
  const served = read > 0 && mix.cacheRead > 0 ? Math.round((mix.cacheRead / read) * 100) : null
  const tokens = mine.reduce((n, a) => n + a.tokens, 0)
  const empty = r && r.turns === 0 && r.costUsd === 0
  const day = r?.busiest ? DAYS[r.busiest.day]! : null
  const pushed = [...(r?.accounts ?? [])].filter((a) => a.weeklyPeak !== null).sort((a, b) => b.weeklyPeak! - a.weeklyPeak!)[0]
  const model = r?.byModel[0]
  const modelsTotal = r?.byModel.reduce((n, m) => n + m.usd, 0) ?? 0

  const headline = () => {
    if (!r) return null
    const d = change(cost, whole ? r.before.usd : (mine[0]?.beforeUsd ?? 0))
    const mood = !d ? 'A' : d.pct >= 20 ? 'A heavy' : d.pct <= -20 ? 'A lighter' : 'A steady'
    const heavy = r.perDay.reduce((b, x, i) => (x.ms > (r.perDay[b]?.ms ?? 0) ? i : b), 0)
    return (
      <>
        <h2>{mood} week: <em>{money(cost)}</em> across {mine.length} {mine.length === 1 ? 'account' : 'accounts'} and <em>{durationLabel(ms)}</em> of agent work.</h2>
        <p>
          {r.perDay[heavy]!.ms > 0 && <>{DAYS[heavy]} carried it: {durationLabel(r.perDay[heavy]!.ms)} and {money(r.perDay[heavy]!.usd)}. </>}
          {pushed && pushed.weeklyPeak! >= 85 && <>{view(pushed.key)?.name} was close to the wall ({Math.round(pushed.weeklyPeak!)}% of its weekly allowance). </>}
        </p>
      </>
    )
  }

  const said = (): { tone: 'hot' | 'ok' | 'info'; text: ReactNode }[] => {
    if (!r) return []
    const out: { tone: 'hot' | 'ok' | 'info'; text: ReactNode }[] = []
    for (const a of r.accounts.filter((x) => x.hits5h > 0)) out.push({ tone: 'hot', text: <><b>{view(a.key)?.name ?? a.key}</b> ran out of its 5-hour allowance {a.hits5h} {a.hits5h === 1 ? 'time' : 'times'}.{r.accounts.some((x) => x.weeklyPeak !== null && x.weeklyPeak < 70 && x.key !== a.key) && <> Another account had room to take some of it.</>}</> })
    for (const a of r.accounts.filter((x) => x.weeklyPeak !== null && x.weeklyPeak < 70)) out.push({ tone: 'ok', text: <><b>{view(a.key)?.name ?? a.key}</b> never passed {Math.round(a.weeklyPeak!)}% of its weekly allowance, so it had room to spare.</> })
    const lowest = r.accounts.filter((x) => x.turns > 0).sort((x, y) => x.turns - y.turns)[0]
    if (r.accounts.length > 1 && lowest && lowest.turns < 3) out.push({ tone: 'info', text: <><b>{view(lowest.key)?.name ?? lowest.key}</b> was nearly idle: {lowest.turns} {lowest.turns === 1 ? 'turn' : 'turns'} all week.</> })
    return out.slice(0, 3)
  }

  return (
    <Modal label="Weekly Rewind" className="stats" onClose={onClose}>
      <header className="settings-head">
        <b>Weekly Rewind</b>
        <span className="st-nav">
          <button onClick={() => shift(-1)} aria-label="Previous week" title="Previous week">‹</button>
          <span>{range(start)}</span>
          <button onClick={() => shift(1)} disabled={thisWeek} aria-label="Next week" title="Next week">›</button>
        </span>
        <button onClick={onClose} aria-label="Close" title="Close">×</button>
      </header>
      <div className="st-scope" role="group" aria-label="Show">
        <span className="st-lbl">Showing</span>
        <button className={whole ? 'on' : ''} aria-pressed={whole} onClick={() => setScope('all')}><i className="acct-dot" style={{ background: 'var(--accent)' }} />All</button>
        {ordered.map((v) => (
          <button key={v.key} className={scope === v.key ? 'on' : ''} aria-pressed={scope === v.key} onClick={() => setScope(v.key)} title={`${v.name} · ${v.provider}`}>
            <AcctName v={v} />
          </button>
        ))}
      </div>
      <div className="st-tabs" role="tablist" aria-label="Rewind view">
        {(['week', 'accounts', 'projects'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {{ week: 'The week', accounts: 'Accounts', projects: 'Projects & agents' }[t]}
          </button>
        ))}
      </div>
      {!r ? (
        <p className="st-note">Loading…</p>
      ) : (
        <div className="st-body">
          {empty && <p className="st-note">Nothing recorded this week. Agents' work and spending are kept from now on.</p>}

          {tab === 'week' && (
            <>
              {!empty && <div className="st-hero">{headline()}{whole && (change(cost, r.before.usd) || tokDelta) && (
                <div className="st-card">
                  <span>vs last week</span>
                  {change(cost, r.before.usd) && <><b>{change(cost, r.before.usd)!.text}</b><small>cost · {money(r.before.usd)} · {durationLabel(r.before.ms)}</small></>}
                  {tokDelta && <><b style={{ marginTop: 4 }}>{tokDelta.text}</b><small>tokens · {tokenLabel(r.before.tokens)}{tokDelta.io ? ' · without cache' : ''}</small></>}
                </div>
              )}</div>}
              <div className="st-cards five">
                <Card label="Agent time" value={durationLabel(ms)} note="active agent time" delta={whole ? change(ms, r.before.ms) : null} />
                <Card label="Cost" value={money(cost)} note={cost > 0 && turns > 0 ? `${money(cost / turns)} per turn` : 'this week'} delta={whole ? change(cost, r.before.usd) : null} />
                <Card
                  label="Tokens"
                  value={tokens > 0 ? tokenLabel(tokens) : '–'}
                  delta={whole || mine.length === 1 ? tokDelta : null}
                  note={tokDelta?.io ? 'without cache: last week had none' : served !== null ? `${served}% served from cache` : 'read and written, by programs that report them'}
                  bar={tokens > 0 ? <MixBar r={mix} /> : null}
                />
                <Card label="Turns" value={String(turns)} note={`${agentCount} ${agentCount === 1 ? 'agent' : 'agents'}`} delta={whole ? change(turns, r.before.turns) : null} />
                <Card label="Peak window" value={r.peak ? `${hour(r.peak.from)} – ${hour(r.peak.to)}` : '–'} note={r.peak ? `${durationLabel(r.peak.ms)} of work, all accounts` : 'no work yet'} />
              </div>
              <div className="st-two wide">
                <section>
                  <div className="st-row">
                    <h3>Day by day <span className="lm-hint">{measure === 'usd' ? 'cost' : 'tokens'} by account, hours under each day</span></h3>
                    <span className="st-seg" role="group" aria-label="Measure">
                      <button aria-pressed={measure === 'usd'} className={measure === 'usd' ? 'on' : ''} onClick={() => setMeasure('usd')}>$</button>
                      <button aria-pressed={measure === 'tokens'} className={measure === 'tokens' ? 'on' : ''} onClick={() => setMeasure('tokens')}>Tokens</button>
                    </span>
                  </div>
                  <DayStack r={r} keys={keys} view={view} measure={measure} />
                  <div className="st-legend">{keys.map((k) => view(k) && <span key={k}><AcctName v={view(k)!} size={12} /></span>)}</div>
                </section>
                <section>
                  <h3>When the work happened <span className="lm-hint">all accounts</span></h3>
                  <Heat rows={r.heat} days={DAYS} />
                </section>
              </div>
              <div className="st-highlights">
                <Card label="Busiest day" value={day ?? '–'} note={r.busiest ? `${r.busiest.agents} ${r.busiest.agents === 1 ? 'agent' : 'agents'} at work` : 'none yet'} />
                <Card label="Longest stretch" value={r.longest ? durationLabel(r.longest.ms) : '–'} note={r.longest ? `${r.longest.name}, ${when(r.longest.t)} · ${r.longest.project}` : 'none yet'} />
                <Card label="Priciest turn" value={r.priciest ? money(r.priciest.usd) : '–'} note={r.priciest ? <>{r.priciest.name} on {view(r.priciest.key)?.name ?? ''}, {r.priciest.project}</> : 'no spending'} />
                <Card label="Top project" value={r.topProject?.name ?? '–'} note={r.topProject ? `${r.topProject.agents} ${r.topProject.agents === 1 ? 'agent' : 'agents'}` : 'none yet'} />
                <Card label="Top agent" value={r.topAgent?.name ?? '–'} note={r.topAgent ? <>{durationLabel(r.topAgent.ms)} · {view(r.topAgent.key)?.name}</> : 'none yet'} />
                <Card label="Most used model" value={model?.model ?? '–'} note={model && modelsTotal > 0 ? `${Math.round((model.usd / modelsTotal) * 100)}% of spend` : 'no spending'} />
                <Card label="Most pushed" value={pushed ? (view(pushed.key)?.name ?? '–') : '–'} note={pushed ? `${Math.round(pushed.weeklyPeak!)}% of its weekly allowance` : 'no limits looked at yet'} />
              </div>
            </>
          )}

          {tab === 'accounts' && (
            <>
              <section>
                <h3>How hard each account was pushed <span className="lm-hint">weekly allowance used, fullest point each day</span></h3>
                {mine.filter((a) => a.weeklyPeak !== null).length === 0 ? <p className="st-note">No allowance was looked at this week. The app saves it while it is open.</p> : (
                  <div className="st-accts">
                    {mine.filter((a) => a.weeklyPeak !== null).map((a) => (
                      <div key={a.key} className="st-acct" style={{ ['--c' as string]: view(a.key)?.color }}>
                        <header>{view(a.key) && <AcctName v={view(a.key)!} size={16} />}<small>peak {Math.round(a.weeklyPeak!)}%{a.hits5h > 0 ? ` · ${a.hits5h}× out of 5-hour` : ''}</small></header>
                        <LimitLine a={a} color={view(a.key)?.color ?? 'var(--accent)'} />
                        <div className="st-days">{DAYS.map((d) => <span key={d}>{d.slice(0, 1)}</span>)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
              <section>
                <h3>The week per account</h3>
                <table className="st-table st-acct-table">
                  <thead><tr><th>Account</th><th>Cost</th><th>vs last week</th><th>Tokens</th><th>vs last week</th><th>Time</th><th>Turns</th><th>5-hour hits</th><th>Weekly peak</th></tr></thead>
                  <tbody>
                    {mine.map((a) => {
                      const d = change(a.usd, a.beforeUsd)
      const td = tokenDelta(a.mix, a.beforeMix)
                      return (
                        <tr key={a.key}>
                          <td>{view(a.key) ? <AcctName v={view(a.key)!} /> : a.key}</td>
                          <td>{a.usd > 0 ? `${view(a.key)?.keeps === false ? '~' : ''}${money(a.usd)}` : '—'}</td>
                          <td>{d ? <i className="st-delta" data-up={d.up}>{d.text}</i> : '—'}</td>
                          <td>{a.tokens > 0 ? tokenLabel(a.tokens) : '—'}</td>
                          <td>{td ? <i className="st-delta" data-up={td.up} title={td.io ? 'Compared without the cache: last week had none' : undefined}>{td.text}{td.io ? '*' : ''}</i> : '—'}</td>
                          <td>{durationLabel(a.ms)}</td>
                          <td>{a.turns}</td>
                          <td>{a.hits5h || '—'}</td>
                          <td data-level={a.weeklyPeak !== null && a.weeklyPeak >= 85 ? 'hot' : undefined}>{a.weeklyPeak !== null ? `${Math.round(a.weeklyPeak)}%` : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </section>
              {said().length > 0 && <div className="st-insights">{said().map((x, i) => <p key={i} className="st-insight" data-tone={x.tone}>{x.text}</p>)}</div>}
            </>
          )}

          {tab === 'projects' && (
            <>
              <div className="st-two wide">
                <section>
                  <h3>Projects <span className="lm-hint">time · cost, all accounts</span></h3>
                  {r.projects.length === 0 ? <p className="st-note">No work.</p> : r.projects.slice(0, 8).map((p) => (
                    <div key={p.name} className="st-model">
                      <span>{p.name}</span>
                      <i><b style={{ width: `${(p.usd / Math.max(r.projects[0]!.usd, 0.0001)) * 100}%` }} /></i>
                      <span>{durationLabel(p.ms)} · {money(p.usd)}</span>
                    </div>
                  ))}
                </section>
                <section>
                  <h3>Agents <span className="lm-hint">turns · cost · account</span></h3>
                  {r.agentList.filter((a) => keys.includes(a.key)).length === 0 ? <p className="st-note">No work.</p> : r.agentList.filter((a) => keys.includes(a.key)).slice(0, 8).map((a) => (
                    <div key={a.agent} className="st-rank two">
                      <div><b>{a.name}</b> {view(a.key) && <AcctName v={view(a.key)!} size={12} />}<small>{a.turns} {a.turns === 1 ? 'turn' : 'turns'} · {durationLabel(a.ms)}</small></div>
                      <span className="amt">{money(a.usd)}</span>
                    </div>
                  ))}
                </section>
              </div>
              <section>
                <h3>Cost by model <span className="lm-hint">all accounts</span></h3>
                {r.byModel.length === 0 ? <p className="st-note">No spending.</p> : r.byModel.map((m) => (
                  <div key={m.model} className="st-model">
                    <span>{m.model}</span>
                    <i><b style={{ width: `${(m.usd / Math.max(modelsTotal, 0.0001)) * 100}%` }} /></i>
                    <span>{money(m.usd)}</span>
                  </div>
                ))}
              </section>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
