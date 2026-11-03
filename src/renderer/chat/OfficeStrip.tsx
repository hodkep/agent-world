import { useCallback, useEffect, useState } from 'react'
import type { OfficeCheck } from '../../shared/api'

/** Agents whose strip was put away with "Not now" or "Later": it stays away until the app starts again. */
const putAway = new Set<string>()

type Phase = 'warn' | 'confirm' | 'running' | 'done' | 'error'

/**
 * The note at the top of an agent's chat when its program cannot reach the office's tools (agy's list names a program that is gone, or has no entry for this
 * build). It changes nothing by itself: Repair shows the commands first, and Run is the click that makes the change.
 */
export function OfficeStrip({ agentId, agentName, visible }: { agentId: string; agentName: string; visible: boolean }) {
  const [check, setCheck] = useState<OfficeCheck | null>(null)
  const [phase, setPhase] = useState<Phase>('warn')
  const [failed, setFailed] = useState('')
  const [away, setAway] = useState(() => putAway.has(agentId))
  const refresh = useCallback(() => window.aw.officeCheck(agentId).then(setCheck, () => setCheck(null)), [agentId])
  // Looked at when the chat is shown: the answer changes when agy's list does, which is read from a file.
  useEffect(() => {
    if (visible && phase === 'warn') void refresh()
  }, [visible, phase, refresh])
  useEffect(() => setAway(putAway.has(agentId)), [agentId])

  const hide = () => (putAway.add(agentId), setAway(true))
  const run = async () => {
    setPhase('running')
    try {
      setCheck(await window.aw.officeRepair(agentId))
      setPhase('done')
    } catch (err) {
      setFailed(err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err))
      setPhase('error')
    }
  }
  if (away || (phase === 'warn' && !check?.problem)) return null
  const why = check?.problem === 'missing' ? 'agy is not connected to the office.' : 'agy’s list names a program that is not installed.'
  return (
    <div className={`office-strip-wrap`}>
      <div className={`office-strip ${phase === 'done' ? 'ok' : ''}`} role={phase === 'error' ? 'alert' : 'status'} data-phase={phase}>
        <span className={`office-mark ${phase === 'done' ? 'ok' : ''}`} aria-hidden="true">{phase === 'done' ? '✓' : '!'}</span>
        {phase === 'warn' && (
          <>
            <span><b>{agentName} cannot reach the office’s tools.</b> {why}</span>
            <button className="primary" onClick={() => setPhase('confirm')}>{check?.problem === 'missing' ? 'Connect' : 'Repair'}</button>
          </>
        )}
        {phase === 'confirm' && (
          <>
            <span><b>Change agy’s list?</b> Only the office’s entry and plugin: its other servers stay as they are.</span>
            <button onClick={() => setPhase('warn')}>Not now</button>
            <button className="primary" onClick={() => void run()}>Run</button>
          </>
        )}
        {phase === 'running' && <span><b>Changing agy’s list…</b></span>}
        {phase === 'done' && (
          <>
            <span><b>Done.</b> agy loads its tools when it starts: restart {agentName} to use them.</span>
            <button className="primary" onClick={() => void window.aw.reconfigure(agentId, {}).then(hide, hide)}>Restart {agentName}</button>
            <button className="quiet" onClick={hide}>Later</button>
          </>
        )}
        {phase === 'error' && (
          <>
            <span><b>It did not work.</b> {failed}</span>
            <button onClick={() => setPhase('warn')}>Close</button>
          </>
        )}
      </div>
      {phase === 'confirm' && check && (
        <pre className="office-cmds" aria-label="The commands that will run">{check.commands.join('\n')}</pre>
      )}
    </div>
  )
}
