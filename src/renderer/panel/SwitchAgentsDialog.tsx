import { useEffect, useMemo, useState } from 'react'
import type { ProviderInfo } from '../../shared/types'
import { type SwitchAgent, type SwitchResult, SWITCH_CONTINUE, planSwitch } from '../../shared/switchPlan'
import { Modal } from './Modal'

type Phase = 'confirm' | 'running' | 'done'
type RowState = SwitchResult['state'] | 'queued'

const plural = (n: number) => `${n} ${n === 1 ? 'agent' : 'agents'}`
const what = (a: SwitchAgent) => (!a.online ? 'asleep' : a.activity === 'permission' ? 'waiting on a permission request' : (a.activity ?? 'idle'))
const WORD: Record<RowState, string> = { queued: 'waiting its turn', stopping: 'stopping…', moved: 'moved', continued: `stopped · moved · sent “${SWITCH_CONTINUE}”`, failed: 'failed' }

/** Moves every agent to one account: the ones mid-turn are stopped first and told to continue once they are back up there; the rest move quietly. */
export function SwitchAgentsDialog({ account, providers, onClose }: { account: { id: string; name: string }; providers: ProviderInfo[]; onClose: () => void }) {
  const [agents, setAgents] = useState<SwitchAgent[] | null>(null)
  const [phase, setPhase] = useState<Phase>('confirm')
  const [rows, setRows] = useState<Record<string, RowState>>({})
  const [why, setWhy] = useState<Record<string, string>>({})
  const [results, setResults] = useState<SwitchResult[]>([])
  const [error, setError] = useState('')
  const look = () => window.aw.accountAgents().then(setAgents, (e) => setError(String(e)))
  useEffect(() => void look(), [])
  const plan = useMemo(() => (agents ? planSwitch(agents, account.id, (p) => providers.some((x) => x.id === p && x.capabilities.accounts)) : null), [agents, account.id, providers])

  const run = async (stopWorking: boolean) => {
    if (!plan) return
    const todo = stopWorking ? [...plan.stop, ...plan.quiet] : plan.quiet
    setError('')
    setRows(Object.fromEntries(todo.map((a) => [a.id, 'queued' as RowState])))
    setPhase('running')
    const off = window.aw.onAccountsSwitch((r) => (setRows((s) => ({ ...s, [r.id]: r.state })), r.error && setWhy((w) => ({ ...w, [r.id]: r.error! }))))
    try {
      setResults(await window.aw.switchAllAgents(account.id, stopWorking))
    } catch (e) {
      setError((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    } finally {
      off()
      setPhase('done')
    }
  }

  const ids = Object.keys(rows)
  const settled = ids.filter((id) => rows[id] !== 'queued' && rows[id] !== 'stopping').length
  const failed = results.filter((r) => r.state === 'failed')
  const ok = results.length - failed.length
  const list = (items: SwitchAgent[]) => items.map((a) => (
    <div className="swa-row" key={a.id}>
      <b>{a.name}</b>
      <span>{what(a)}</span>
      <i className={`swa-chip ${a.activity === 'permission' ? 'warn' : a.online && !['idle', 'waiting'].includes(a.activity ?? 'idle') ? 'work' : ''}`}>{a.activity === 'permission' ? 'needs you' : a.online && !['idle', 'waiting'].includes(a.activity ?? 'idle') ? 'working' : a.online ? 'idle' : 'asleep'}</i>
    </div>
  ))
  const names = (items: SwitchAgent[]) => (items.length > 4 ? `${items.slice(0, 4).map((a) => a.name).join(', ')} +${items.length - 4}` : items.map((a) => a.name).join(', '))

  return (
    <Modal label={`Switch all agents to ${account.name}`} className="swa-dialog" onClose={onClose}>
      <div className="settings-head">
        <b>
          {phase === 'confirm' && (plan ? (plan.moving ? `Switch ${plan.moving === 1 ? '1 agent' : `${plan.moving} agents`} to ${account.name}?` : `Nothing to switch to ${account.name}`) : 'Looking at the agents…')}
          {phase === 'running' && `Switching ${plural(ids.length)} to ${account.name}…`}
          {phase === 'done' && (error ? `Could not switch to ${account.name}` : failed.length === 0 ? `Switched ${plural(ok)} to ${account.name}` : `Switched ${ok} of ${plural(results.length)} to ${account.name}`)}
        </b>
      </div>
      <div className="swa-body">
        {phase === 'confirm' && plan && (
          <>
            {plan.moving === 0 && <p>Every agent that can change account is already on {account.name}.</p>}
            {plan.stop.length > 0 && (
              <>
                <div className="swa-group">Working now ({plan.stop.length}): will be stopped, then told to {SWITCH_CONTINUE}</div>
                {list(plan.stop)}
              </>
            )}
            {plan.quiet.length > 0 && (
              <>
                <div className="swa-group">Idle or asleep ({plan.quiet.length}): moved quietly, not messaged</div>
                <div className="swa-row"><b>{names(plan.quiet)}</b></div>
              </>
            )}
            {plan.moving > 0 && <p className="swa-note">Each conversation stays: the agent resumes the same session on {account.name}. The message sent is <code>{SWITCH_CONTINUE}</code>. A permission request that was open is cancelled by the stop, and asked again if the agent still needs it.</p>}
            {plan.unsupported.length > 0 && <p className="swa-note">{plural(plan.unsupported.length)} of a program with one login only {plan.unsupported.length === 1 ? 'is' : 'are'} left alone.</p>}
          </>
        )}
        {phase === 'running' && (
          <>
            <div className="swa-bar" role="progressbar" aria-valuemin={0} aria-valuemax={ids.length} aria-valuenow={settled}><i style={{ width: `${ids.length ? (settled / ids.length) * 100 : 0}%` }} /></div>
            {ids.map((id) => {
              const a = agents?.find((x) => x.id === id)
              return (
                <div className="swa-row" key={id}>
                  <b>{a?.name ?? id}</b>
                  <span>{WORD[rows[id]!]}</span>
                  <i className={`swa-chip ${rows[id] === 'moved' || rows[id] === 'continued' ? 'ok' : rows[id] === 'failed' ? 'bad' : rows[id] === 'stopping' ? 'work' : ''}`}>{rows[id] === 'moved' || rows[id] === 'continued' ? 'done' : rows[id] === 'failed' ? 'failed' : rows[id] === 'stopping' ? 'working' : 'queued'}</i>
                </div>
              )
            })}
          </>
        )}
        {phase === 'done' && (
          <>
            {error && <p role="alert">{error}</p>}
            {!error && <p>{[results.filter((r) => r.state === 'continued').length && `${results.filter((r) => r.state === 'continued').length} stopped and told to ${SWITCH_CONTINUE}`, results.filter((r) => r.state === 'moved').length && `${results.filter((r) => r.state === 'moved').length} moved quietly`].filter(Boolean).join('. ')}.</p>}
            {failed.map((r) => (
              <div className="swa-row" key={r.id}>
                <b>{r.name}</b>
                <span>{why[r.id] ?? r.error ?? 'could not be moved'}</span>
                <i className="swa-chip bad">failed</i>
              </div>
            ))}
            {failed.length > 0 && <p className="swa-note">An agent that fails stays on its old account with its conversation; nothing is lost.</p>}
          </>
        )}
      </div>
      <div className="swa-foot">
        {phase === 'confirm' && (
          <>
            <button onClick={onClose}>{plan?.moving === 0 ? 'Close' : 'Cancel'}</button>
            {plan && plan.stop.length > 0 && plan.quiet.length > 0 && <button onClick={() => void run(false)}>Switch idle ones only</button>}
            {plan && plan.moving > 0 && (
              <button className="primary" onClick={() => void run(true)}>
                {plan.stop.length > 0 ? 'Stop them, switch and continue' : `Switch ${plural(plan.moving)}`}
              </button>
            )}
          </>
        )}
        {phase === 'running' && <button disabled>Close</button>}
        {phase === 'done' && (
          <>
            {(failed.length > 0 || error) && <button onClick={() => (setResults([]), setError(''), setPhase('confirm'), void look())}>Look again</button>}
            <button className="primary" onClick={onClose}>Done</button>
          </>
        )}
      </div>
    </Modal>
  )
}
