import { useEffect, useRef, useState } from 'react'
import { toneOf } from './EventChips'
import { elapsedLabel } from './format'
import type { ToolRun } from './ToolCard'
import { inWords, monitorView, scheduleView } from './watch'
import { type Armed, armedOf } from './watching'
import { startClock } from '../clock'

const s = (v: unknown) => (typeof v === 'string' ? v : '')

/** The time, ticking every second while something on the card counts down. */
function useNow(live: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!live) return
    setNow(Date.now())
    return startClock(() => setNow(Date.now()))
  }, [live])
  return now
}

const Eye = () => (
  <svg className="glyph" viewBox="0 0 16 16" aria-hidden="true" shapeRendering="crispEdges">
    <path fill="currentColor" d="M1 8h1V7h1V6h2V5h6v1h2v1h1v1h1v-1h-1V6h-1V5h-2V4H5v1H3v1H2v1H1zM6 6h4v1h1v2h-1v1H6V9H5V7h1zM7 7v2h2V7z" />
    <path fill="currentColor" d="M1 8v1h1v1h1v1h2v1h6v-1h2v-1h1V9h1V8h-1v1h-1v1h-2v1H5v-1H3V9H2V8z" />
  </svg>
)
const Clock = () => (
  <svg className="glyph" viewBox="0 0 16 16" aria-hidden="true" shapeRendering="crispEdges">
    <path fill="currentColor" d="M5 1h6v1h2v1h1v2h1v6h-1v2h-1v1h-2v1H5v-1H3v-1H2v-2H1V5h1V3h1V2h2zM3 5v6h1v1h1v1h6v-1h1v-1h1V5h-1V4h-1V3H5v1H4v1zM7 4h2v4h2v2H7z" />
  </svg>
)

const STATE = { starting: 'Starting', watching: 'Watching', fired: 'Fired', ended: 'Ended', expired: 'Expired', failed: 'Not started' } as const

/** A Monitor call: what it waits for, the command in one line, how long it will watch, and what it printed. */
export function MonitorCard({ run }: { run: ToolRun }) {
  const [openCmd, setOpenCmd] = useState(false)
  const [allLines, setAllLines] = useState(false)
  const armed = !run.ended && !!run.result && !run.result.isError
  const now = useNow(armed)
  const v = monitorView(run, now)
  const lines = run.firings ?? []
  const live = v.state === 'watching' || v.state === 'fired'
  const rail = v.state === 'failed' ? 'bad' : v.state === 'ended' || v.state === 'expired' ? 'off' : ''
  const command = s(run.input.command)
  const shown = allLines ? lines : lines.slice(-3)
  const first = run.at ?? 0
  const label = v.state === 'fired' ? `Fired ${lines.length}×` : STATE[v.state]
  return (
    <article className={`wc ${rail}`} aria-label={`Monitor: ${s(run.input.description) || command.slice(0, 40)}`} data-watch={v.id || undefined}>
      <div className="wc-h">
        <Eye />
        <span className="kind">Monitor</span>
        {v.id && <span className="chipw">{v.id}</span>}
        <span className={`state ${rail === 'off' ? 'quiet' : ''} ${live ? 'pulse' : ''}`}>{label}</span>
      </div>
      <p className="wc-title">{s(run.input.description) || 'Watching a command'}</p>
      <div className={`cmd ${openCmd ? 'open' : ''}`}>
        <span className="p">$</span>
        <span className="t">{command}</span>
        {command.length > 70 && (
          <button aria-expanded={openCmd} onClick={() => setOpenCmd(!openCmd)}>
            {openCmd ? 'less' : 'all'}
          </button>
        )}
      </div>
      <div className="meta">
        {live ? (
          <div className="clock">
            <div className="bar">
              <i style={{ width: `${v.fill * 100}%` }} />
            </div>
            <span>expires in {inWords(v.remainingMs)}</span>
          </div>
        ) : v.state === 'ended' ? (
          <span>ran for {inWords((run.ended ?? first) - first)}</span>
        ) : v.state === 'expired' ? (
          <span>watched for {inWords(v.totalMs)}; the agent has to start it again if it still needs it</span>
        ) : v.state === 'failed' ? (
          <span className="wc-err">{(run.result?.text ?? '').slice(0, 200)}</span>
        ) : (
          <span>starting…</span>
        )}
      </div>
      {lines.length > 0 && (
        <>
          <div className="log-h">
            What it printed
            {lines.length > 3 && <button onClick={() => setAllLines(!allLines)}>{allLines ? 'Show the last 3' : `Show all ${lines.length}`}</button>}
          </div>
          <ul className="log">
            {shown.map((l, i) => (
              <li key={`${l.at}-${i}`} className={toneOf(l.text.split('\n')[0] ?? '') === 'ok' ? 'good' : toneOf(l.text.split('\n')[0] ?? '')}>
                <time>{elapsedLabel(Math.max(0, l.at - first)).replace(/\.\d s$/, ' s')}</time>
                <span>{l.text || '(a line with nothing on it)'}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </article>
  )
}

/** A Schedule call: what it is for, when, how often, what it will do, and what became of it. */
export function ScheduleCard({ run }: { run: ToolRun }) {
  const [open, setOpen] = useState(false)
  const probe = scheduleView(run, run.at ?? Date.now())
  const now = useNow(!run.cancelled && (probe.target === null || probe.target > (run.at ?? 0)))
  const v = scheduleView(run, now)
  const prompt = s(run.input.prompt)
  // A loop's own bookkeeping prompt reads as what it is.
  const plain = prompt.startsWith('<<') ? 'carry on with the loop' : prompt
  const long = plain.length > 90
  // With no reason given the title is the prompt itself: it is not said twice.
  const repeatsTitle = !s(run.input.reason).trim() && !plain.includes('\n')
  const label = { waiting: 'Waiting', repeats: 'Repeats', ran: 'Woke it', cancelled: 'Cancelled' }[v.state]
  return (
    <article className={`wc sched ${v.state === 'cancelled' ? 'off' : ''}`} aria-label={`Scheduled: ${v.title}`} data-watch={`sched:${run.id ?? ''}`}>
      <div className="wc-h">
        <Clock />
        <span className="kind">Scheduled</span>
        <span className="chipw">{v.repeat || (run.input.noop === true ? 'a pause' : 'once')}</span>
        <span className={`state ${v.state === 'cancelled' || v.state === 'ran' ? 'quiet' : ''}`}>{label}</span>
      </div>
      <p className="wc-title">{v.title}</p>
      <div className="meta">
        <b>{v.when}</b>
        {v.left && <span>in {v.left}</span>}
        {v.left && (
          <div className="clock">
            <div className="bar">
              <i style={{ width: `${v.fill * 100}%` }} />
            </div>
          </div>
        )}
      </div>
      {plain && !repeatsTitle && (
        <div className="prompt">
          <small>When it wakes</small>
          {open || !long ? plain : `${plain.slice(0, 90)}…`}{' '}
          {long && (
            <button className="wc-more" aria-expanded={open} onClick={() => setOpen(!open)}>
              {open ? 'less' : 'all'}
            </button>
          )}
        </div>
      )}
    </article>
  )
}

/** A call that cancels a schedule: a quiet line, since the schedule's own card says it was cancelled. */
export function UnscheduleLine({ run }: { run: ToolRun }) {
  const id = s(run.input.id)
  return <div className="wc-line">{id ? `Cancelled the schedule ${id}` : 'Stopped the loop: no more wake-ups'}</div>
}

/** What is still watching or waiting, as chips beside "subagents working": a list that scrolls to each card and asks the agent to cancel it. */
export function WatchLine({ runs, agentId, agentName, jump }: { runs: ToolRun[]; agentId: string; agentName: string; jump: (key: string) => void }) {
  const [open, setOpen] = useState(false)
  const [told, setTold] = useState<string | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const now = useNow(runs.some((r) => r.name === 'Monitor' || r.name === 'Schedule'))
  const armed = armedOf(runs, now)
  const monitors = armed.filter((a) => a.kind === 'monitor')
  const schedules = armed.filter((a) => a.kind === 'schedule')
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), setOpen(false))
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', esc, true)
    return () => {
      window.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', esc, true)
    }
  }, [open])
  useEffect(() => {
    if (armed.length === 0) setOpen(false)
  }, [armed.length])
  if (armed.length === 0) return null
  const ask = (a: Armed) => {
    if (!window.confirm(`Ask ${agentName} to cancel “${a.title}”? It costs ${agentName} a turn.`)) return
    void window.aw.chatSend(agentId, a.stop).then(
      () => setTold(`Asked ${agentName} to cancel it.`),
      (e: unknown) => setTold(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': /, '') : String(e))
    )
  }
  const group = (title: string, list: Armed[]) =>
    list.length > 0 && (
      <>
        <h4>{title}</h4>
        {list.map((a) => (
          <div key={a.key} className={`wl-i ${a.kind}`}>
            <button className="wl-jump" onClick={() => (jump(a.key), setOpen(false))} title="Show its card in the conversation">
              <b>{a.title}</b>
              <small>{a.detail}</small>
            </button>
            <span className="wl-when">{a.when}</span>
            <button className="wl-ask" onClick={() => ask(a)}>
              Ask {agentName} to cancel it
            </button>
          </div>
        ))}
      </>
    )
  return (
    <div className="procbar watchbar" ref={wrap}>
      {monitors.length > 0 && (
        <button className="procs-btn" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)} aria-label={`${monitors.length} ${monitors.length === 1 ? 'monitor' : 'monitors'} watching`}>
          <span className="procs-dot crew-dot" aria-hidden="true" />
          {monitors.length} {monitors.length === 1 ? 'monitor' : 'monitors'}
        </button>
      )}
      {schedules.length > 0 && (
        <button className="procs-btn" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)} aria-label={`${schedules.length} scheduled`}>
          <span className="procs-dot sched-dot" aria-hidden="true" />
          {schedules.length} scheduled
        </button>
      )}
      {open && (
        <div className="procs-pop watch-pop" role="dialog" aria-label="Watching and waiting">
          {group('Monitors', monitors)}
          {group('Scheduled', schedules)}
          {told && <p className="wl-told" role="status">{told}</p>}
        </div>
      )}
    </div>
  )
}
