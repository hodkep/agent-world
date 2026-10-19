import { useCallback, useEffect, useRef, useState } from 'react'
import { MergeGate } from '../workflows/MergeGate'
import { mergeRows } from '../workflows/mergeRows'
import { BasePicker } from './BasePicker'

type Status = Awaited<ReturnType<typeof window.aw.finishStatus>>

/**
 * Under the run's track in an agent's chat while it has commits its base branch does not: the audit's findings to tick, what stands in the way, and Land (merge or
 * squash, and whether the agent leaves). It only reads (the app starts the audit itself). `needs` is set when the person's word is what
 * the run waits for.
 */
export function Finish({ agentId, agentName, activity, needs, onDone }: { agentId: string; agentName: string; /** The agent's turn ending or starting is when the commits and the checks change. */ activity: string; needs: boolean; onDone: (removed: boolean) => void }) {
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState('')
  const [squash, setSquash] = useState(false)
  const [message, setMessage] = useState('')
  const [cleanup, setCleanup] = useState(true)
  const [busy, setBusy] = useState(false)
  // One look at a time: a slow one is not stacked under by the next tick of the timer.
  const looking = useRef(false)
  const load = useCallback(async () => {
    if (looking.current) return
    looking.current = true
    try {
      const s = await window.aw.finishStatus(agentId, { readOnly: true })
      setStatus(s)
      setError('')
      setMessage((m) => (m && !m.startsWith('Merge ') ? m : `Merge ${s.branch}`))
    } catch (e) {
      setError((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    } finally {
      looking.current = false
    }
  }, [agentId])
  useEffect(() => {
    void load()
    // The audit answers a while after it was asked for, and findings are ticked from here: both change the check. A commit made by hand in the terminal says nothing, so it is looked for now and then.
    const off = window.aw.onWorkflows(() => void load())
    const timer = setInterval(() => void load(), 3000)
    return () => (off(), clearInterval(timer))
  }, [load, activity])
  const checks = status && [
    { ok: status.ahead > 0, text: status.ahead > 0 ? `${status.ahead} commit${status.ahead === 1 ? '' : 's'} on ${status.branch} to land` : `Nothing to land: ${status.base} already has everything on ${status.branch}` },
    { ok: status.uncommitted === 0, text: status.uncommitted === 0 ? 'Everything is committed' : `${status.uncommitted} file${status.uncommitted === 1 ? '' : 's'} not committed yet (commit in the Code tab)` },
    { ok: status.baseReady, text: status.baseReady ? `Your checkout is on ${status.base} with nothing uncommitted` : `Your own checkout must be on ${status.base} with nothing uncommitted` },
    { ok: status.conflicts.length === 0, text: status.conflicts.length === 0 ? `No conflicts with ${status.base}` : `Would conflict in ${status.conflicts.join(', ')}` }
  ]
  const rows = status?.merge ? mergeRows(status.merge) : []
  const held = !!status?.merge?.blocking.length
  const ready = !!checks && checks.every((c) => c.ok)
  const land = async () => {
    setBusy(true)
    setError('')
    try {
      const r = await window.aw.finishRun(agentId, { squash, message, cleanup, anyway: held })
      onDone(r.removed)
    } catch (e) {
      setError((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
      setBusy(false)
    }
  }
  // Nothing to land: no band. A look that failed before there was any status is said, not hidden.
  if (!status && error) return <p className="hint bad finish-error" role="alert">Could not read {agentName}'s branch: {error}</p>
  if (!status || status.ahead === 0) return null
  return (
    <details className={`finish finish-band ${needs ? 'needs' : ''}`} role="region" aria-label={`Finish ${agentName}'s work`} open>
      <summary>
        <span className="tag">{needs ? 'Needs you' : ready ? 'Ready to land' : 'Not ready yet'}</span>
        <b>{status.branch} → {status.base}</b>
        <small>{status.ahead} commit{status.ahead === 1 ? '' : 's'}</small>
      </summary>
      {status?.merge && <MergeGate merge={status.merge} onSeen={(i) => void window.aw.finishSeen(agentId, [i])} onAgain={() => void window.aw.finishAudit(agentId)} />}
      <fieldset>
        <legend>Ready?</legend>
        <ul className="checks">
          {checks?.map((c) => (
            <li key={c.text} className={c.ok ? 'ok' : 'no'}>
              <span aria-hidden="true">{c.ok ? '✓' : '✗'}</span> {c.text}
            </li>
          ))}
          {rows.map((r) => (
            <li key={r.text} className={r.ok === null ? 'note' : r.ok ? 'ok' : 'no'}>
              <span aria-hidden="true">{r.ok === null ? '•' : r.ok ? '✓' : '✗'}</span> {r.text}
            </li>
          ))}
        </ul>
      </fieldset>
      {status && (
        <fieldset>
          <legend>Land it</legend>
          <div className="finish-into">
            <span>Into</span>
            <BasePicker value={status.base} label="Branch to land on" load={() => window.aw.code.branches(agentId)} onPick={async (b) => (await window.aw.code.setBase(agentId, b), await load())} note="Changes where this lands, and what it is compared with. Nothing else." />
          </div>
          <label className="check">
            <input type="radio" name="how" checked={!squash} onChange={() => (setSquash(false), setMessage(`Merge ${status.branch}`))} /> Merge, keeping each commit
          </label>
          <label className="check">
            <input type="radio" name="how" checked={squash} onChange={() => setSquash(true)} /> Squash into one commit
          </label>
          {squash && (
            <label>
              Commit message
              <input value={message} onChange={(e) => setMessage(e.target.value)} />
            </label>
          )}
          <label className="check">
            <input type="checkbox" checked={cleanup} onChange={(e) => setCleanup(e.target.checked)} /> Then remove {agentName}, its worktree and branch
          </label>
        </fieldset>
      )}
      {error && (
        <p className="hint bad" role="alert">
          {error}
        </p>
      )}
      <div className="settings-row finish-land">
        <button className="primary" disabled={!ready || busy || (squash && !message.trim())} onClick={() => void land()}>
          {busy ? 'Landing…' : `${held ? 'Land anyway' : 'Land'} on ${status?.base ?? 'base'}`}
        </button>
      </div>
    </details>
  )
}
