import { useCallback, useEffect, useState } from 'react'

/**
 * The warning for agents that started before this project's workflow was set: they have no workflow tools until they restart. The Library's own card, with
 * the same button. Hidden when none is stale, and asks the office now and then since the answer changes when the workflow or Workflows is switched.
 */
export function RestartBanner({ folder }: { folder: string | null }) {
  const [stale, setStale] = useState<{ id: string; name: string }[]>([])
  const [restarting, setRestarting] = useState(false)
  const [busy, setBusy] = useState<string[]>([])
  const refresh = useCallback(() => (folder ? window.aw.workflows.stale(folder).then(setStale, () => setStale([])) : Promise.resolve(setStale([]))), [folder])
  useEffect(() => {
    void refresh()
    const t = setInterval(() => void refresh(), 5000)
    return () => clearInterval(t)
  }, [refresh])
  const restart = async () => {
    setRestarting(true)
    const failed: string[] = []
    for (const a of stale) await window.aw.reconfigure(a.id, {}).catch(() => void failed.push(a.name))
    setBusy(failed)
    setRestarting(false)
    setTimeout(() => void refresh(), 1500)
  }
  if (stale.length === 0) return null
  const one = stale.length === 1
  return (
    <div className="lib-notice warn" role="note">
      <div>
        <b>{stale.length} {one ? 'agent started' : 'agents started'} before this workflow was set.</b>
        <span>{stale.map((a) => a.name).join(', ')} {one ? 'does not have' : 'do not have'} the workflow tools until {one ? 'it restarts' : 'they restart'}, so no task is recorded.</span>
        {busy.length > 0 && <span>{busy.join(', ')} {busy.length === 1 ? 'is' : 'are'} in the middle of a turn. Try again when {busy.length === 1 ? 'it finishes' : 'they finish'}.</span>}
        <div className="actions"><button className="primary" disabled={restarting} onClick={() => void restart()}>{restarting ? 'Restarting…' : `Restart ${stale.length} ${one ? 'agent' : 'agents'}`}</button></div>
      </div>
    </div>
  )
}
