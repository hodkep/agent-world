import { useEffect, useMemo, useState } from 'react'
import type { Account, ProviderInfo } from '../../shared/types'
import { type SwitchAgent, type SwitchResult, SWITCH_BATCH, SWITCH_CONTINUE, byProject, isWorking, pickedByDefault, planSwitch } from '../../shared/switchPlan'
import { Modal } from './Modal'

type Phase = 'confirm' | 'running' | 'done'
type RowState = SwitchResult['state'] | 'queued'

const plural = (n: number) => `${n} ${n === 1 ? 'agent' : 'agents'}`
const what = (a: SwitchAgent) => (!a.online ? 'asleep' : a.activity === 'permission' ? 'waiting on a permission request' : (a.activity ?? 'idle'))
const WORD: Record<RowState, string> = { queued: 'waiting its turn', stopping: 'stopping…', starting: 'starting up…', left: 'left on its old account', moved: 'moved', continued: `stopped · moved · sent “${SWITCH_CONTINUE}”`, failed: 'failed' }

/** A project's box: ticked when all its agents are, dashes when some are. */
function ProjectBox({ label, state, onToggle }: { label: string; state: 'all' | 'some' | 'none'; onToggle: () => void }) {
  return <input type="checkbox" aria-label={label} checked={state === 'all'} ref={(el) => void (el && (el.indeterminate = state === 'some'))} onChange={onToggle} />
}

/**
 * Moves the agents the person ticks to one account (every one that is not on it yet, to begin with): the ones mid-turn are stopped first and told to continue once they
 * are back up there; the rest move quietly. A ticked agent that is already on the account is restarted on it, which puts right one whose process kept the old login.
 */
export function SwitchAgentsDialog({ account, accounts, providers, onClose }: { account: { id: string; name: string }; accounts: Account[]; providers: ProviderInfo[]; onClose: () => void }) {
  const [agents, setAgents] = useState<SwitchAgent[] | null>(null)
  const [picked, setPicked] = useState<Set<string> | null>(null)
  const [phase, setPhase] = useState<Phase>('confirm')
  const [rows, setRows] = useState<Record<string, RowState>>({})
  const [why, setWhy] = useState<Record<string, string>>({})
  const [results, setResults] = useState<SwitchResult[]>([])
  const [error, setError] = useState('')
  const [stopAsked, setStopAsked] = useState(false)
  const canSwitch = (p: string) => providers.some((x) => x.id === p && x.capabilities.accounts)
  const look = () =>
    window.aw.accountAgents().then(
      (l) => (setAgents(l), setPicked(pickedByDefault(l, account.id, canSwitch))),
      (e) => setError(String(e))
    )
  useEffect(() => void look(), [])
  const plan = useMemo(() => (agents && picked ? planSwitch(agents, account.id, canSwitch, picked) : null), [agents, picked, account.id, providers])
  const nameOf = (id: string) => (id ? (accounts.find((x) => x.id === id)?.name ?? id) : 'This computer')
  const choosable = (agents ?? []).filter((a) => canSwitch(a.provider))
  const toggle = (ids: string[], on: boolean) => setPicked((s) => new Set(on ? [...(s ?? []), ...ids] : [...(s ?? [])].filter((i) => !ids.includes(i))))

  const run = async (stopWorking: boolean) => {
    if (!plan) return
    const todo = stopWorking ? [...plan.stop, ...plan.quiet] : plan.quiet
    const chosen = [...(picked ?? [])]
    setError('')
    setStopAsked(false)
    setRows(Object.fromEntries(todo.map((a) => [a.id, 'queued' as RowState])))
    setPhase('running')
    const off = window.aw.onAccountsSwitch((r) => (setRows((s) => ({ ...s, [r.id]: r.state })), r.error && setWhy((w) => ({ ...w, [r.id]: r.error! }))))
    try {
      setResults(await window.aw.switchAllAgents(account.id, stopWorking, chosen))
    } catch (e) {
      setError((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    } finally {
      off()
      setPhase('done')
    }
  }

  // Every agent ticked is already on the account: the action is a restart of them on it, not a move.
  const allThere = choosable.length > 0 && choosable.every((a) => a.account === account.id)
  const restarting = !!plan && plan.moving > 0 && [...plan.stop, ...plan.quiet].every((a) => a.account === account.id)
  const ids = Object.keys(rows)
  const settled = ids.filter((id) => rows[id] !== 'queued' && rows[id] !== 'stopping' && rows[id] !== 'starting').length
  const failed = results.filter((r) => r.state === 'failed')
  const left = results.filter((r) => r.state === 'left')
  const ok = results.length - failed.length - left.length
  const groups = Math.ceil(ids.length / SWITCH_BATCH)
  return (
    <Modal label={`Switch all agents to ${account.name}`} className="swa-dialog" onClose={onClose}>
      <div className="settings-head">
        <b>
          {phase === 'confirm' && (plan ? (plan.moving ? `${restarting ? 'Restart' : 'Switch'} ${plan.moving === 1 ? '1 agent' : `${plan.moving} agents`} ${restarting ? 'on' : 'to'} ${account.name}?` : allThere ? `Every agent is already on ${account.name}` : `Choose agents to switch to ${account.name}`) : 'Looking at the agents…')}
          {phase === 'running' && `Switching ${plural(ids.length)} to ${account.name}…`}
          {phase === 'done' && (error ? `Could not switch to ${account.name}` : failed.length === 0 && left.length === 0 ? `Switched ${plural(ok)} to ${account.name}` : `Switched ${ok} of ${plural(results.length)} to ${account.name}`)}
        </b>
      </div>
      <div className="swa-body">
        {phase === 'confirm' && plan && agents && (
          <>
            {allThere && <p>Every agent is already on {account.name}. You can still restart agents on it: each one resumes its own conversation.</p>}
            {choosable.length > 0 && (
              <div className="swa-quick">
                <span>Select:</span>
                <button className="ghost" onClick={() => setPicked(new Set(choosable.map((a) => a.id)))}>all</button>
                <button className="ghost" onClick={() => setPicked(new Set())}>none</button>
                <button className="ghost" onClick={() => setPicked(pickedByDefault(agents, account.id, canSwitch))}>only those not on {account.name}</button>
              </div>
            )}
            {byProject(choosable).map((g) => {
              const ids = g.agents.map((a) => a.id)
              const on = ids.filter((i) => picked?.has(i)).length
              return (
                <div className="swa-project" key={g.project} role="group" aria-label={`Agents of ${g.name}`}>
                  <label className="swa-proj">
                    <ProjectBox label={`All agents of ${g.name}`} state={on === 0 ? 'none' : on === ids.length ? 'all' : 'some'} onToggle={() => toggle(ids, on !== ids.length)} />
                    {g.name} · {plural(ids.length)}
                  </label>
                  {g.agents.map((a) => {
                    const here = a.account === account.id
                    const ticked = !!picked?.has(a.id)
                    return (
                      <label className="swa-row swa-pick" key={a.id}>
                        <input type="checkbox" aria-label={a.name} checked={ticked} onChange={(e) => toggle([a.id], e.target.checked)} />
                        <b>{a.name}</b>
                        <span>
                          {what(a)} · {here ? `already on ${account.name}` : `on ${nameOf(a.account)}`}
                        </span>
                        {ticked && isWorking(a) ? <i className="swa-chip work">will be stopped</i> : ticked && here ? <i className="swa-chip">restart</i> : a.activity === 'permission' ? <i className="swa-chip warn">needs you</i> : null}
                      </label>
                    )
                  })}
                </div>
              )
            })}
            {plan.moving > 0 && <p className="swa-note">Each conversation stays: the agent resumes the same session on {account.name}. The message sent to a stopped agent is <code>{SWITCH_CONTINUE}</code>. A permission request that was open is cancelled.</p>}
            {plan.moving > SWITCH_BATCH && <p className="swa-note">They start {SWITCH_BATCH} at a time, so a big office does not swamp the computer. Allow about 20 seconds for each group of {SWITCH_BATCH}.</p>}
            {plan.unsupported.length > 0 && <p className="swa-note">{plural(plan.unsupported.length)} of a program with one login only {plan.unsupported.length === 1 ? 'is' : 'are'} left alone.</p>}
          </>
        )}
        {phase === 'running' && (
          <>
            {ids.length > SWITCH_BATCH && (
              <div className="swa-cap">
                <span>{stopAsked ? 'Stopping after these…' : `Group ${Math.min(groups, Math.floor(settled / SWITCH_BATCH) + 1)} of ${groups} · starting up to ${SWITCH_BATCH} at a time`}</span>
                <span>{settled} of {ids.length} done</span>
              </div>
            )}
            <div className="swa-bar" role="progressbar" aria-valuemin={0} aria-valuemax={ids.length} aria-valuenow={settled}><i style={{ width: `${ids.length ? (settled / ids.length) * 100 : 0}%` }} /></div>
            {ids.map((id) => {
              const a = agents?.find((x) => x.id === id)
              return (
                <div className="swa-row" key={id}>
                  <b>{a?.name ?? id}</b>
                  <span>{WORD[rows[id]!]}</span>
                  <i className={`swa-chip ${rows[id] === 'moved' || rows[id] === 'continued' ? 'ok' : rows[id] === 'failed' ? 'bad' : rows[id] === 'left' ? 'warn' : rows[id] === 'starting' ? 'work blink' : rows[id] === 'stopping' ? 'work' : ''}`}>{rows[id] === 'moved' || rows[id] === 'continued' ? 'done' : rows[id] === 'failed' ? 'failed' : rows[id] === 'left' ? 'left' : rows[id] === 'starting' ? 'starting' : rows[id] === 'stopping' ? 'working' : 'queued'}</i>
                </div>
              )
            })}
          </>
        )}
        {phase === 'done' && (
          <>
            {error && <p role="alert">{error}</p>}
            {!error && <p>{[results.filter((r) => r.state === 'continued').length && `${results.filter((r) => r.state === 'continued').length} stopped and told to ${SWITCH_CONTINUE}`, results.filter((r) => r.state === 'moved').length && `${results.filter((r) => r.state === 'moved').length} moved quietly`, left.length && `${left.length} left on ${left.length === 1 ? 'its' : 'their'} old account`].filter(Boolean).join('. ')}.</p>}
            {failed.map((r) => (
              <div className="swa-row" key={r.id}>
                <b>{r.name}</b>
                <span>{why[r.id] ?? r.error ?? 'could not be moved'}</span>
                <i className="swa-chip bad">failed</i>
              </div>
            ))}
            {left.map((r) => (
              <div className="swa-row" key={r.id}>
                <b>{r.name}</b>
                <span>{WORD.left}</span>
                <i className="swa-chip warn">left</i>
              </div>
            ))}
            {left.length > 0 && <p className="swa-note">Nothing is lost: an agent that was not moved keeps its conversation and its account. Look again to move the rest.</p>}
            {failed.length > 0 && <p className="swa-note">An agent that fails stays on its old account with its conversation; nothing is lost.</p>}
          </>
        )}
      </div>
      <div className="swa-foot">
        {phase === 'confirm' && (
          <>
            <button onClick={onClose}>{plan?.moving === 0 && allThere ? 'Close' : 'Cancel'}</button>
            {plan && plan.stop.length > 0 && plan.quiet.length > 0 && <button onClick={() => void run(false)}>Switch idle ones only</button>}
            {plan && plan.moving > 0 && (
              <button className="primary" onClick={() => void run(true)}>
                {plan.stop.length > 0 ? 'Stop them, switch and continue' : restarting ? `Restart ${plural(plan.moving)}` : `Switch ${plural(plan.moving)}`}
              </button>
            )}
          </>
        )}
        {phase === 'running' && (
          <>
            {ids.some((id) => rows[id] === 'queued') && (
              <button disabled={stopAsked} onClick={() => (setStopAsked(true), void window.aw.stopSwitch())}>
                Stop after these
              </button>
            )}
            <button disabled>Close</button>
          </>
        )}
        {phase === 'done' && (
          <>
            {(failed.length > 0 || left.length > 0 || error) && <button onClick={() => (setResults([]), setError(''), setPhase('confirm'), void look())}>Look again</button>}
            <button className="primary" onClick={onClose}>Done</button>
          </>
        )}
      </div>
    </Modal>
  )
}
