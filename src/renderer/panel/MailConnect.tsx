import { useState } from 'react'
import type { ProviderInfo } from '../../shared/types'

/** Some providers need one change in their own settings before their agents can use the office message box. It is shown first, word for word, and made only on approval. */
export function MailConnect({ provider, onChanged }: { provider: ProviderInfo; onChanged: () => void }) {
  const [plan, setPlan] = useState<{ files: string[]; commands: string[]; note: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (provider.mail === 'yes' || provider.mail === 'no') return null

  const change = async (on: boolean) => {
    setBusy(true)
    setError('')
    try {
      await window.aw.setMail(provider.id, on)
      setPlan(null)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (provider.mail === 'connected')
    return (
      <div className="mc" data-state="connected">
        <span className="hint">Its agents can message the others and share notes.</span>
        <button className="su-link" onClick={() => void change(false)} disabled={busy}>Disconnect</button>
        {error && <span className="su-why">{error}</span>}
      </div>
    )
  return (
    <div className="mc" data-state="missing">
      {!plan ? (
        <>
          <span className="hint">Its agents cannot message the others yet.</span>
          <button onClick={() => void window.aw.mailPlan(provider.id).then(setPlan)}>Let {provider.label} message other agents…</button>
        </>
      ) : (
        <div className="mc-plan" role="group" aria-label={`Connect ${provider.label} to the message box`}>
          <p>{plan.note}</p>
          <b>It writes</b>
          {plan.files.map((f) => <code key={f}>{f}</code>)}
          <b>It runs</b>
          {plan.commands.map((c) => <code key={c}>{c}</code>)}
          <div className="su-row">
            <button className="primary" onClick={() => void change(true)} disabled={busy}>Connect</button>
            <button onClick={() => setPlan(null)} disabled={busy}>Not now</button>
          </div>
          {error && <span className="su-why">{error}</span>}
        </div>
      )}
    </div>
  )
}
