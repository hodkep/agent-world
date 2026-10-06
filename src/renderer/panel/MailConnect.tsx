import { useEffect, useState } from 'react'
import type { ProviderInfo } from '../../shared/types'

/** Some providers need one change in their own settings before their agents can use the office message box. It is shown first, word for word, and made only on approval. */
export function MailConnect({ provider, onChanged, required }: { provider: ProviderInfo; onChanged: () => void; /** Setup cannot go on without it, so there is no "Not now". */ required?: boolean }) {
  const [plan, setPlan] = useState<{ files: string[]; commands: string[]; note: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  // Entries the program still lists for a build of the app that was removed: each makes it fail whenever it tries the office.
  const [stale, setStale] = useState<{ name: string; program: string }[]>([])
  const [forgetting, setForgetting] = useState('')
  const [forgot, setForgot] = useState('')
  useEffect(() => {
    if (provider.mail === 'yes' || provider.mail === 'no') return
    void window.aw.mailStale(provider.id).then(setStale, () => setStale([]))
  }, [provider.id, provider.mail])
  if (provider.mail === 'yes' || provider.mail === 'no') return null

  const forget = async (name: string) => {
    setForgetting(name)
    setError('')
    try {
      setStale(await window.aw.forgetMail(provider.id, name))
      setForgot(`Removed ${name}. Restart any running ${provider.label} session so it stops trying it.`)
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err))
    } finally {
      setForgetting('')
    }
  }
  const leftBehind = (
    <>
      {stale.map((e) => (
        <div key={e.name} className="mc-stale" role="alert">
          <span>
            {provider.label} still lists <code>{e.name}</code>, which starts a program that is not installed (<code>{e.program}</code>). {provider.label} shows an error every time it tries the office through it.
          </span>
          <button onClick={() => void forget(e.name)} disabled={!!forgetting} aria-busy={forgetting === e.name}>
            {forgetting === e.name ? 'Removing…' : `Remove ${e.name}`}
          </button>
        </div>
      ))}
      {forgot && stale.length === 0 && <span className="mc-done" role="status">{forgot}</span>}
    </>
  )

  const change = async (on: boolean) => {
    setBusy(true)
    setError('')
    try {
      // Held for a moment so the change can be seen happening, and then said in words.
      await Promise.all([window.aw.setMail(provider.id, on), new Promise((r) => setTimeout(r, 700))])
      setPlan(null)
      setDone(on ? `Connected: ${provider.label}'s agents can now message the others.` : `Disconnected: ${provider.label}'s agents cannot message the others now.`)
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
        {leftBehind}
        <span className="hint">Its agents can message the others and share notes.</span>
        <button className="su-link" onClick={() => void change(false)} disabled={busy} aria-busy={busy}>
          {busy ? <><span className="su-spin" aria-hidden="true" />Disconnecting…</> : 'Disconnect'}
        </button>
        {done && !busy && <span className="mc-done" role="status">{done}</span>}
        {error && <span className="su-why">{error}</span>}
      </div>
    )
  return (
    <div className="mc" data-state="missing">
      {leftBehind}
      {!plan ? (
        <>
          {done && <span className="mc-done" role="status">{done}</span>}
          <span className="hint">{required ? 'Needed so its agents can message the others and take hand-offs.' : 'Its agents cannot message the others yet.'}</span>
          <button className={required ? 'primary' : ''} disabled={opening} onClick={() => (setOpening(true), void window.aw.mailPlan(provider.id).then(setPlan).finally(() => setOpening(false)))}>
            {opening ? 'Opening…' : `Let ${provider.label} message other agents…`}
          </button>
        </>
      ) : (
        <div className="mc-plan" role="group" aria-label={`Connect ${provider.label} to the message box`}>
          <p>{plan.note}</p>
          <b>It writes</b>
          {plan.files.map((f) => <code key={f}>{f}</code>)}
          <b>It runs</b>
          {plan.commands.map((c) => <code key={c}>{c}</code>)}
          <div className="su-row">
            <button className="primary" onClick={() => void change(true)} disabled={busy} aria-busy={busy}>
              {busy ? <><span className="su-spin" aria-hidden="true" />Connecting…</> : 'Connect'}
            </button>
            {!required && <button onClick={() => setPlan(null)} disabled={busy}>Not now</button>}
            {busy && <span className="hint" role="status">Asking {provider.label} to add the entry; this can take a few seconds.</span>}
          </div>
          {error && <span className="su-why">{error}</span>}
        </div>
      )}
    </div>
  )
}
