import { useEffect, useState } from 'react'
import { acctKey } from '../../shared/ledger'
import type { ShareDay, ShareRow } from '../../shared/attribution'
import type { ProviderInfo } from '../../shared/types'
import type { AcctView } from './acct'

type Kind = 'five_hour' | 'weekly'
const KINDS: { id: Kind; label: string }[] = [
  { id: 'weekly', label: 'Weekly allowance' },
  { id: 'five_hour', label: '5-hour' }
]
const pct = (n: number) => `${Math.round(n)}%`

/** What the app used of one account that day, in words: "up to" while its rate has not been seen twice. */
function said(r: ShareRow, name: string, program: string) {
  const others = Math.max(0, r.used - r.mine)
  return { who: name === program ? program : `${program}, ${name}`, mine: `${r.learning ? 'up to ' : ''}${pct(r.mine)}`, used: pct(r.used), others: r.learning && pct(others) !== '0%' ? `others at least ${pct(others)}` : `others ${pct(others)}` }
}

/**
 * This app's share of every account's allowance, a month of days like the Weekly Rewind's grid. An account says only how full it is,
 * so the app's part is worked out from its own spend (see shared/attribution.ts); hovering a day names it per program and account.
 */
export function ShareTab({ providers, view, scope, now }: { providers: ProviderInfo[]; view: (key: string) => AcctView | undefined; scope: string; now: number }) {
  const today = new Date(now)
  const [at, setAt] = useState({ y: today.getFullYear(), m: today.getMonth() })
  const [kind, setKind] = useState<Kind>('weekly')
  const [report, setReport] = useState<ShareDay[] | null>(null)
  useEffect(() => {
    let live = true
    void window.aw.shareReport(at.y, at.m, kind).then((r) => live && setReport(r.days))
    return () => void (live = false)
  }, [at, kind])
  const step = (by: number) => setAt(({ y, m }) => ({ y: y + Math.floor((m + by) / 12), m: (m + by + 12) % 12 }))
  const first = new Date(at.y, at.m, 1)
  const lead = (first.getDay() + 6) % 7
  const label = (p: string) => providers.find((x) => x.id === p)?.label ?? p
  const shown = (d: ShareDay) => d.rows.filter((r) => scope === 'all' || acctKey(r.provider, r.account) === scope)
  // A stripe's length is the account's rise that day, against the biggest day of the month, so a heavy day reads longer.
  const top = Math.max(1, ...(report ?? []).flatMap((d) => shown(d).map((r) => r.used)))
  const seen = [...new Map((report ?? []).flatMap((d) => shown(d)).map((r) => [acctKey(r.provider, r.account), r])).values()]
  const mark = (d: ShareDay, i: number) => {
    const rows = shown(d)
    const date = new Date(at.y, at.m, i + 1)
    const title = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    const lines = rows.map((r) => said(r, view(acctKey(r.provider, r.account))?.name ?? (r.account || 'Own login'), label(r.provider)))
    const isToday = date.toDateString() === today.toDateString()
    return (
      <div key={d.date} className={`sh-day${isToday ? ' today' : ''}`} data-day={d.date} tabIndex={0} aria-label={`${title}${lines.length ? `: ${lines.map((l) => `${l.who} this app ${l.mine} of ${l.used} used, ${l.others}`).join('; ')}` : ''}`}>
        <span className="sh-n">{i + 1}</span>
        <span className="sh-stripes" aria-hidden>
          {rows.length > 0 && seen.map((x) => {
            const k = acctKey(x.provider, x.account)
            const r = rows.find((y) => acctKey(y.provider, y.account) === k)
            // An account keeps its line in every day, so the same account is the same stripe all down the month.
            return r ? (
              <i key={k} className={`sh-stripe${r.learning ? ' learning' : ''}`} style={{ width: `${Math.max(4, (r.used / top) * 100)}%`, ['--c' as string]: view(k)?.color ?? 'var(--violet)' }}>
                <b style={{ width: `${r.used > 0 ? Math.min(100, (r.mine / r.used) * 100) : 0}%` }} />
              </i>
            ) : (
              <i key={k} className="sh-stripe gap" />
            )
          })}
        </span>
        <div className="sh-tip" aria-hidden>
          <h4>{title}</h4>
          {lines.length === 0 && <span className="learn">Nothing seen</span>}
          {lines.map((l, j) => (
            <div key={j} className="sh-acct">
              <span>{l.who}</span>
              <b>{l.mine} this app</b>
              <em>{l.used} used · {l.others}</em>
            </div>
          ))}
          {rows.some((r) => r.learning) && <span className="learn">still learning</span>}
        </div>
      </div>
    )
  }
  return (
    <section className="sh">
      <div className="sh-bar">
        <span className="st-seg">
          <button aria-label="Previous month" onClick={() => step(-1)}>‹</button>
          <button className="on" aria-pressed disabled>{first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</button>
          <button aria-label="Next month" onClick={() => step(1)} disabled={at.y === today.getFullYear() && at.m === today.getMonth()}>›</button>
        </span>
        <span className="st-seg" role="group" aria-label="Allowance">
          {KINDS.map((k) => <button key={k.id} className={kind === k.id ? 'on' : ''} aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>{k.label}</button>)}
        </span>
      </div>
      {report && !report.some((d) => shown(d).length) && <p className="st-note">Nothing was recorded for this allowance in this month.</p>}
      {!report ? (
        <p className="st-note">Loading…</p>
      ) : (
        <div className="sh-mon" role="grid">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i}>{d}</span>)}
          {Array.from({ length: lead }, (_, i) => <div key={`b${i}`} className="sh-day none" />)}
          {report.map(mark)}
        </div>
      )}
      <div className="sh-legend">
        {seen.map((r) => { const v = view(acctKey(r.provider, r.account)); return <span key={acctKey(r.provider, r.account)}><i style={{ background: v?.color ?? 'var(--violet)' }} />{v?.name ?? (r.account || 'Own login')}</span> })}
        <small>Each stripe is an account's rise that day; the bright part is this app's, the rest is others'. Paler while still learning.</small>
      </div>
      <p className="st-note">The account only says how full it is, so the app's part is worked out from its own spend. It is exact once the app has been the only user of an account for a while; until then it says "up to".</p>
    </section>
  )
}
