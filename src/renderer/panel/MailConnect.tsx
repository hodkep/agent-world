import { useEffect, useState } from 'react'
import type { ProviderInfo } from '../../shared/types'
import { LATE_MS, connectStages, nextPhase, type ConnectPhase } from './mailStages'

/** Some providers need one change in their own settings before their agents can use the office message box. It is shown first, word for word, and made only on approval. */
export function MailConnect({ provider, onChanged, onProgress, required }: { provider: ProviderInfo; /** Asks for the programs to be looked at again; the check is over when it settles. */ onChanged: () => void | Promise<void>; /** What a button that waits for this is waiting for (empty when nothing). */ onProgress?: (waiting: string) => void; /** Setup cannot go on without it, so there is no "Not now". */ required?: boolean }) {
  const [plan, setPlan] = useState<{ files: string[]; commands: string[]; note: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  // Entries the program still lists for a build of the app that was removed: each makes it fail whenever it tries the office.
  const [stale, setStale] = useState<{ name: string; program: string }[]>([])
  const [forgetting, setForgetting] = useState('')
  const [forgot, setForgot] = useState('')
  // Connecting is shown as stages until the program, looked at again, lists the entry: the re-scan takes a few seconds after the entry is written.
  const [phase, setPhase] = useState<ConnectPhase | null>(null)
  const [scanned, setScanned] = useState(false)
  useEffect(() => onProgress?.(phase ? connectStages(phase, provider.label).waiting : ''), [phase, provider.label, onProgress])
  useEffect(() => {
    if (!phase || !scanned) return
    const now = nextPhase(phase, { scanned, mail: provider.mail ?? '' })
    if (now !== phase) return setPhase(now)
    if (phase !== 'checking') return
    const t = setTimeout(() => setPhase((p) => (p ? nextPhase(p, { scanned, mail: provider.mail ?? '', lateMs: LATE_MS }) : p)), LATE_MS)
    return () => clearTimeout(t)
  }, [phase, scanned, provider.mail])
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

  const look = async () => {
    setScanned(false)
    setPhase('checking')
    // Held for a moment so the check can be seen, as the write is.
    await Promise.all([Promise.resolve(onChanged()), new Promise((r) => setTimeout(r, 700))])
    setScanned(true)
  }
  const connect = async () => {
    setBusy(true)
    setError('')
    setPhase('writing')
    try {
      await Promise.all([window.aw.setMail(provider.id, true), new Promise((r) => setTimeout(r, 700))])
    } catch (err) {
      setPhase(null)
      setBusy(false)
      setError(err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err))
      return
    }
    setPlan(null)
    setBusy(false)
    await look()
  }
  const disconnect = async () => {
    setBusy(true)
    setError('')
    try {
      // Held for a moment so the change can be seen happening, and then said in words.
      await Promise.all([window.aw.setMail(provider.id, false), new Promise((r) => setTimeout(r, 700))])
      setPhase(null)
      setDone(`Disconnected: ${provider.label}'s agents cannot message the others now.`)
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (phase) {
    const st = connectStages(phase, provider.label)
    const says = { writing: `Adding the entry to ${provider.label}'s settings.`, checking: `The entry is written. Asking ${provider.label} to confirm; this can take a few seconds.`, ready: `Connected: ${provider.label}'s agents can now message the others.`, failed: `${provider.label} did not confirm it. The entry was written, but ${provider.label} does not list it yet.` }[phase]
    return (
      <div className="mc mc-prog" data-state={phase} role="group" aria-label={`Connecting ${provider.label}`}>
        {leftBehind}
        <ol className="mc-steps">
          {st.steps.map((x) => (
            <li key={x.label} data-step={x.state}>
              <i className="mc-dot" aria-hidden="true" />
              {x.label}
              <span className="sr-only">{x.state === 'done' ? ', done' : x.state === 'doing' ? ', in progress' : x.state === 'failed' ? ', not confirmed' : ', waiting'}</span>
            </li>
          ))}
        </ol>
        <div className="mc-bar" role="progressbar" aria-label={`Connecting ${provider.label}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={st.percent}>
          <i style={{ width: `${st.percent}%` }} />
        </div>
        <span className={phase === 'ready' ? 'mc-done' : phase === 'failed' ? 'su-why' : 'hint'} role="status">{says}</span>
        {phase === 'ready' && <button className="su-link" onClick={() => void disconnect()} disabled={busy} aria-busy={busy}>{busy ? <><span className="su-spin" aria-hidden="true" />Disconnecting…</> : 'Disconnect'}</button>}
        {phase === 'failed' && (
          <div className="su-row">
            <button className="primary" onClick={() => void look()}>Check again</button>
            <button onClick={() => void disconnect()} disabled={busy}>Undo</button>
          </div>
        )}
        {error && <span className="su-why">{error}</span>}
      </div>
    )
  }

  const planView = plan && (
    <div className="mc-plan" role="group" aria-label={`Connect ${provider.label} to the message box`}>
      <p>{plan.note}</p>
      <b>It writes</b>
      {plan.files.map((f) => <code key={f}>{f}</code>)}
      <b>It runs</b>
      {plan.commands.map((c) => <code key={c}>{c}</code>)}
      <div className="su-row">
        <button className="primary" onClick={() => void connect()} disabled={busy} aria-busy={busy}>
          {provider.mailOutdated ? 'Update' : 'Connect'}
        </button>
        {!required && <button onClick={() => setPlan(null)} disabled={busy}>Not now</button>}
      </div>
      {error && <span className="su-why">{error}</span>}
    </div>
  )

  if (provider.mail === 'connected')
    return (
      <div className="mc" data-state="connected">
        {leftBehind}
        {provider.mailOutdated && !plan && (
          <div className="mc-stale" role="alert">
            <span>
              {provider.label}'s plugin for the office is older than this app's. It cannot hold an edit back while a plan waits for you (commits are still held by git).
            </span>
            <button disabled={opening} onClick={() => (setOpening(true), void window.aw.mailPlan(provider.id).then(setPlan).finally(() => setOpening(false)))}>{opening ? 'Opening…' : 'Update the plugin…'}</button>
          </div>
        )}
        {planView}
        <span className="hint">Its agents can message the others and share notes.</span>
        <button className="su-link" onClick={() => void disconnect()} disabled={busy} aria-busy={busy}>
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
        planView
      )}
    </div>
  )
}
