import { useEffect, useState } from 'react'
import { type WeekReport, weekStartOf } from '../../shared/ledger'
import { Modal } from '../panel/Modal'
import { durationLabel } from '../profile/format'
import { Bars, Heat } from './charts'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const money = (n: number) => `$${n.toFixed(2)}`
const hour = (h: number) => `${h % 12 || 12}${h < 12 || h === 24 ? ' AM' : ' PM'}`
const range = (start: number) => {
  const a = new Date(start)
  const b = new Date(a.getFullYear(), a.getMonth(), a.getDate() + 6)
  const m = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `${m(a)} – ${m(b)}, ${b.getFullYear()}`
}

function Card({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="st-card">
      <span>{label}</span>
      <b>{value}</b>
      <small>{note}</small>
    </div>
  )
}

/** The week's work in numbers and charts, from the history the app keeps. */
export function RewindModal({ onClose }: { onClose: () => void }) {
  const [start, setStart] = useState(() => weekStartOf(Date.now()))
  const [r, setR] = useState<WeekReport | null>(null)
  useEffect(() => {
    let live = true
    void window.aw.weekReport(start).then((x) => live && setR(x))
    return () => {
      live = false
    }
  }, [start])
  const thisWeek = start >= weekStartOf(Date.now())
  const shift = (weeks: number) => setStart((s) => weekStartOf(new Date(s).setDate(new Date(s).getDate() + 7 * weeks + 1)))
  const empty = r && r.turns === 0 && r.costUsd === 0
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
      {!r ? (
        <p className="st-note">Loading…</p>
      ) : (
        <div className="st-body">
          {empty && <p className="st-note">Nothing recorded this week. Agents' work and spending are kept from now on.</p>}
          <div className="st-cards">
            <Card label="Agent time" value={durationLabel(r.agentMs)} note="active agent time" />
            <Card label="Agents" value={String(r.agents)} note={`${r.turns} ${r.turns === 1 ? 'turn' : 'turns'} of work`} />
            <Card label="Cost" value={money(r.costUsd)} note="this week" />
            <Card label="Peak window" value={r.peak ? `${hour(r.peak.from)} – ${hour(r.peak.to)}` : '–'} note={r.peak ? durationLabel(r.peak.ms) + ' of work' : 'no work yet'} />
            <Card label="Top project" value={r.topProject?.name ?? '–'} note={r.topProject ? `${r.topProject.agents} ${r.topProject.agents === 1 ? 'agent' : 'agents'}` : 'none yet'} />
            <Card label="Busiest day" value={r.busiest ? DAYS[r.busiest.day]! : '–'} note={r.busiest ? `${r.busiest.agents} ${r.busiest.agents === 1 ? 'agent' : 'agents'}` : 'none yet'} />
          </div>
          <div className="st-two">
            <section>
              <h3>Agents by day</h3>
              <Bars label="Agents by day" rows={r.perDay.map((d, i) => ({ label: DAYS[i]!.slice(0, 3), value: d.agents }))} show={(n) => String(n)} />
            </section>
            <section>
              <h3>Cost by day</h3>
              <Bars label="Cost by day" rows={r.perDay.map((d, i) => ({ label: DAYS[i]!.slice(0, 3), value: d.usd }))} show={money} />
            </section>
          </div>
          <div className="st-two">
            <section>
              <h3>Cost by model</h3>
              {r.byModel.length === 0 ? <p className="st-note">No spending.</p> : r.byModel.map((m) => (
                <div key={m.model} className="st-model">
                  <span>{m.model}</span>
                  <i><b style={{ width: `${(m.usd / r.costUsd) * 100}%` }} /></i>
                  <span>{money(m.usd)}</span>
                </div>
              ))}
            </section>
            <section>
              <h3>Activity</h3>
              <Heat rows={r.heat} days={DAYS} />
            </section>
          </div>
        </div>
      )}
    </Modal>
  )
}
