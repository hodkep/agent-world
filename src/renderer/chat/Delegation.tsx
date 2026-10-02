import { useEffect, useMemo, useState } from 'react'
import type { SubagentInfo } from '../../shared/chat'
import { type Row, type SubagentState, elapsedLabel, subagentState } from './format'
import { Markdown } from './markdown'

type Call = Extract<Row, { kind: 'delegation' }>['calls'][number]

const WORD: Record<SubagentState, string> = { waiting: 'waiting', working: 'working', done: 'done', stopped: 'stopped' }

/** Asks for the agent's subagents now and again every couple of seconds until all of them have answered. */
function useSubagents(agentId: string, calls: Call[]) {
  const [infos, setInfos] = useState<SubagentInfo[]>([])
  const [now, setNow] = useState(Date.now())
  const key = calls.map((c) => c.toolUseId).join(',')
  const mine = useMemo(() => new Map(infos.filter((i) => key.includes(i.toolUseId)).map((i) => [i.toolUseId, i])), [infos, key])
  const settled = calls.every((c) => subagentState(mine.get(c.toolUseId), now) === 'done')
  useEffect(() => {
    let alive = true
    const look = () => void window.aw.subagents(agentId).then((l) => alive && setInfos(l), () => {})
    look()
    if (settled) return () => void (alive = false)
    const t = setInterval(() => (look(), setNow(Date.now())), 1500)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [agentId, settled, key])
  return { mine, now, settled }
}

function Trail({ info, now }: { info: SubagentInfo | undefined; now: number }) {
  if (!info) return <div className="dg-open dg-muted">Not started yet.</div>
  return (
    <div className="dg-open">
      {info.calls.length === 0 && <div className="dg-muted">No calls yet.</div>}
      {info.calls.map((c, i) => (
        <div key={i} className="dg-call">
          <span className="dg-at">{elapsedLabel(c.at - info.startedAt)}</span>
          <b>{c.name}</b>
          <span className="dg-detail">{c.detail}</span>
        </div>
      ))}
      {info.done && info.result && (
        <div className="dg-result">
          <Markdown text={info.result} />
        </div>
      )}
      {!info.done && <div className="dg-muted">{subagentState(info, now) === 'stopped' ? 'It stopped without giving an answer.' : 'No answer yet.'}</div>}
    </div>
  )
}

function Timeline({ info, now }: { info: SubagentInfo | undefined; now: number }) {
  if (!info) return <span className="dg-track" aria-hidden="true" />
  const end = info.done ? info.updatedAt : Math.max(now, info.updatedAt)
  const span = Math.max(1, end - info.startedAt)
  return (
    <span className="dg-track" aria-hidden="true">
      {info.calls.map((c, i) => (
        <i key={i} className="dg-tick" style={{ left: `${Math.min(99, ((c.at - info.startedAt) / span) * 100)}%` }} />
      ))}
    </span>
  )
}

/** The subagents one reply started, as a single card: a row for each, with where it is at and everything it did. */
export function Delegation({ agentId, calls }: { agentId: string; calls: Call[] }) {
  const { mine, now, settled } = useSubagents(agentId, calls)
  const [open, setOpen] = useState<boolean | null>(null)
  const [rows, setRows] = useState<Set<string>>(new Set())
  const states = calls.map((c) => subagentState(mine.get(c.toolUseId), now))
  const count = (s: SubagentState) => states.filter((x) => x === s).length
  const shown = open ?? !settled
  const summary = [count('working') && `${count('working')} working`, count('waiting') && `${count('waiting')} waiting`, count('done') && `${count('done')} done`, count('stopped') && `${count('stopped')} stopped`].filter(Boolean).join(' · ')
  return (
    <section className={`dg ${settled ? 'is-done' : ''}`} aria-label={`Delegated to ${calls.length} subagent${calls.length === 1 ? '' : 's'}`}>
      <div className="dg-head">
        <span className={`dg-dot s-${settled ? 'done' : 'working'}`} aria-hidden="true" />
        <b className="dg-title">Delegated to {calls.length} subagent{calls.length === 1 ? '' : 's'}</b>
        <span className="dg-count">{summary}</span>
        <button className="dg-toggle" aria-expanded={shown} onClick={() => setOpen(!shown)}>
          {shown ? 'Hide' : `Show ${calls.length === 1 ? 'result' : `${calls.length} results`}`}
        </button>
      </div>
      <div className="dg-seg" aria-hidden="true">
        {states.map((s, i) => (
          <i key={i} className={`s-${s}`} />
        ))}
      </div>
      {shown && (
        <div className="dg-rows">
          {calls.map((c, i) => {
            const info = mine.get(c.toolUseId)
            const st = states[i]!
            const last = info?.calls.at(-1)
            const isOpen = rows.has(c.toolUseId)
            return (
              <div key={c.toolUseId} className={`dg-row s-${st}`}>
                <button
                  className="dg-line"
                  aria-expanded={isOpen}
                  onClick={() => setRows((cur) => (cur.has(c.toolUseId) ? new Set([...cur].filter((x) => x !== c.toolUseId)) : new Set(cur).add(c.toolUseId)))}
                >
                  <span className="dg-dot" aria-hidden="true" />
                  <span className="dg-what">
                    <span>
                      <span className="dg-type">{info?.type ?? c.subagentType}</span> {c.description}
                    </span>
                    <span className="dg-now">{st === 'working' && last ? `${last.name} ${last.detail}` : WORD[st]}</span>
                  </span>
                  <Timeline info={info} now={now} />
                  <span className="dg-time">{info ? elapsedLabel((info.done ? info.updatedAt : now) - info.startedAt) : '–'}</span>
                </button>
                {isOpen && <Trail info={info} now={now} />}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
