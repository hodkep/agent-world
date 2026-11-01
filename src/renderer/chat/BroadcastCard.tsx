import { type BroadcastRow, type BroadcastState, parseBroadcastResult } from '../../shared/mail'
import type { ToolRun } from './ToolCard'

export type RowState = BroadcastState | 'dropped'
export interface RecipientRow {
  name: string
  status: RowState
  reason: string
  /** The agent's id when the list knows it (Traces does); the chat finds it by name. */
  id?: string
}

const WORD: Record<RowState, string> = { delivered: 'Delivered', queued: 'Queued', asleep: 'Asleep', limit: 'Not sent', dropped: 'Dropped' }

/** The wave that sets a broadcast apart from private mail. */
export function WaveIcon() {
  return (
    <svg className="mail-env bc-wave" viewBox="0 0 14 10" aria-hidden="true">
      <path fill="currentColor" d="M6 4h2v2H6zM3 2h1v1H3zM3 7h1v1H3zM10 2h1v1h-1zM10 7h1v1h-1zM2 3h1v4H2zM11 3h1v4h-1zM0 1h1v1H0zM0 8h1v1H0zM13 1h1v1h-1zM13 8h1v1h-1zM1 2h1v1H1zM1 7h1v1H1zM12 2h1v1h-1zM12 7h1v1h-1z" />
    </svg>
  )
}

/** How many of the agents were sent it. */
export const broadcastTag = <T extends { status: RowState }>(rows: T[]): string => {
  const got = rows.filter((r) => r.status === 'delivered' || r.status === 'queued').length
  return rows.length === 0 ? 'Nobody' : `${got} got it`
}

/** One line for each agent: its state, why when nothing was sent or it waits, and Wake for a sleeping one (only the person can wake it). */
export function BroadcastRows({ rows, onWake }: { rows: RecipientRow[]; onWake?: (row: RecipientRow) => void }) {
  return (
    <ul className="bc-rows">
      {rows.map((r) => (
        <li key={`${r.id ?? r.name}`} className={`bc-row ${r.status}`}>
          <i className={`bc-dot ${r.status}`} aria-hidden="true" />
          <b>{r.name}</b>
          <span className="w">{WORD[r.status]}</span>
          <span className="why">{r.reason}</span>
          {r.status === 'asleep' && onWake && <button className="bc-wake" onClick={() => onWake(r)}>Wake</button>}
        </li>
      ))}
    </ul>
  )
}

/** The person wakes a sleeping agent. The chat knows it by name, which is only one agent's inside the sender's project: another project may have the same name. */
export async function wakeByName(row: RecipientRow, senderId: string): Promise<void> {
  const all = row.id ? [] : await window.aw.listAgents()
  const project = all.find((a) => a.id === senderId)?.repoPath
  const id = row.id ?? all.find((a) => a.name === row.name && a.repoPath === project)?.id
  if (id) await window.aw.wakeAgent(id)
}

/** The agent's own broadcast_message call as the sending side of a mail card: the words once, then who got it and who did not. */
export function BroadcastSentCard({ run, agentId }: { run: ToolRun; /** The sender: its project is where the names are looked up. */ agentId: string }) {
  const message = typeof run.input.message === 'string' ? run.input.message : ''
  const read = run.result && !run.result.isError ? parseBroadcastResult(run.result.text) : null
  const rows = read?.rows ?? []
  const tag = !run.result ? 'Sending…' : read ? broadcastTag(rows) : 'Not sent'
  return (
    <article className="mail open bc" aria-label={`Broadcast to ${rows.length} agents`}>
      <header className="mail-head">
        <WaveIcon />
        <span className="mail-from">
          <span className="mail-lbl">Broadcast to</span> {rows.length || ''} {rows.length === 1 ? 'agent' : 'agents'}
        </span>
        <span className={`mail-tag ${!run.result ? '' : read ? 'go' : 'bad'}`}>{tag}</span>
      </header>
      <div className="mail-body">{message}</div>
      {run.result && !read && <div className="mail-body bc-err">{run.result.text}</div>}
      {read && <BroadcastRows rows={rows} onWake={(r) => void wakeByName(r, agentId)} />}
    </article>
  )
}
