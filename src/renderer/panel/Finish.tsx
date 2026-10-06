import { useCallback, useEffect, useRef, useState } from 'react'
import { BasePicker } from './BasePicker'

type Status = Awaited<ReturnType<typeof window.aw.finishStatus>>

/** Land an agent's work on its base branch: what stands in the way, merge or squash, and whether the agent leaves. */
export function Finish({ agentId, agentName, onClose, onDone }: { agentId: string; agentName: string; onClose: () => void; onDone: (removed: boolean) => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState('')
  const [squash, setSquash] = useState(false)
  const [message, setMessage] = useState('')
  const [cleanup, setCleanup] = useState(true)
  const [busy, setBusy] = useState(false)
  const load = useCallback(
    () =>
      window.aw.finishStatus(agentId).then(
        (s) => (setStatus(s), setError(''), setMessage((m) => (m && !m.startsWith('Merge ') ? m : `Merge ${s.branch}`))),
        (e: Error) => setError(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
      ),
    [agentId]
  )
  useEffect(() => {
    dialog.current?.showModal()
    void load()
  }, [load])
  const checks = status && [
    { ok: status.ahead > 0, text: status.ahead > 0 ? `${status.ahead} commit${status.ahead === 1 ? '' : 's'} on ${status.branch} to land` : `Nothing to land: ${status.base} already has everything on ${status.branch}` },
    { ok: status.uncommitted === 0, text: status.uncommitted === 0 ? 'Everything is committed' : `${status.uncommitted} file${status.uncommitted === 1 ? '' : 's'} not committed yet (commit in the Code tab)` },
    { ok: status.baseReady, text: status.baseReady ? `Your checkout is on ${status.base} with nothing uncommitted` : `Your own checkout must be on ${status.base} with nothing uncommitted` },
    { ok: status.conflicts.length === 0, text: status.conflicts.length === 0 ? `No conflicts with ${status.base}` : `Would conflict in ${status.conflicts.join(', ')}` }
  ]
  const ready = !!checks && checks.every((c) => c.ok)
  const land = async () => {
    setBusy(true)
    setError('')
    try {
      const r = await window.aw.finishRun(agentId, { squash, message, cleanup })
      onDone(r.removed)
    } catch (e) {
      setError((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
      setBusy(false)
    }
  }
  return (
    <dialog ref={dialog} className="settings finish" aria-label={`Finish ${agentName}'s work`} onClose={onClose} onCancel={onClose}>
      <header className="settings-head">
        <b>Finish {agentName}'s work</b>
        <button onClick={onClose}>Close</button>
      </header>
      <fieldset>
        <legend>Ready?</legend>
        {!status && !error && <span className="hint">Checking…</span>}
        <ul className="checks">
          {checks?.map((c) => (
            <li key={c.text} className={c.ok ? 'ok' : 'no'}>
              <span aria-hidden="true">{c.ok ? '✓' : '✗'}</span> {c.text}
            </li>
          ))}
        </ul>
      </fieldset>
      {status && (
        <fieldset>
          <legend>Land it</legend>
          <div className="finish-into">
            <span>Into</span>
            <BasePicker value={status.base} label="Branch to land on" load={() => window.aw.code.branches(agentId)} onPick={async (b) => (await window.aw.code.setBase(agentId, b), setStatus(null), await load())} note="Changes where this lands, and what it is compared with. Nothing else." />
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
        <p className="hint bad" role="alert" style={{ padding: '0 14px' }}>
          {error}
        </p>
      )}
      <div className="settings-row" style={{ padding: '10px 14px', justifyContent: 'flex-end' }}>
        <button className="primary" disabled={!ready || busy || (squash && !message.trim())} onClick={() => void land()}>
          {busy ? 'Landing…' : `Land on ${status?.base ?? 'base'}`}
        </button>
      </div>
    </dialog>
  )
}
