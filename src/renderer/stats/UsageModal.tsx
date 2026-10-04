import { useCallback, useEffect, useState } from 'react'
import type { UsageReport } from '../../shared/ledger'
import { Modal } from '../panel/Modal'
import { Bars } from './charts'

const money = (n: number) => `$${n.toFixed(2)}`
const RANGES = [7, 30, 90]
const dayLabel = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

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
          <p className="st-note">Updated {new Date(at).toLocaleTimeString()}</p>
        </div>
      )}
    </Modal>
  )
}
