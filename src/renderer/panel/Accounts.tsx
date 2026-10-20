import { useCallback, useEffect, useState } from 'react'
import type { AccountInfo, Prefs, ProviderId, ProviderInfo } from '../../shared/types'
import { ProviderTag } from './ProviderTag'
import { accountColor } from '../accounts'
import { TerminalView } from './TerminalView'
import { SwitchAgentsDialog } from './SwitchAgentsDialog'

/** Settings › Accounts: each Claude subscription is signed in once, in a folder of its own, and agents can then move between them without signing in again. */
export function Accounts({ prefs, providers, onChange }: { prefs: Prefs; providers: ProviderInfo[]; onChange: (patch: Partial<Prefs>) => void }) {
  // Any program that can keep logins apart gets its own group; nothing here is about one program.
  const keepers = providers.filter((p) => p.capabilities.accounts && p.detection.state !== 'not-installed')
  const [list, setList] = useState<AccountInfo[] | null>(null)
  const [error, setError] = useState('')
  // "Switch all agents here": the account whose dialog is open.
  const [switching, setSwitching] = useState<{ id: string; name: string } | null>(null)
  // The add flow: a name, then the account's own sign-in in a terminal the user can see.
  const [adding, setAdding] = useState<{ step: 'name' | 'sign-in'; provider: ProviderId; name: string; id: string; pty: string; checking: boolean } | null>(null)
  const refresh = useCallback(() => window.aw.listAccounts().then(setList), [])
  useEffect(() => void refresh(), [refresh, prefs.accounts])

  const stop = () => {
    if (adding?.pty) window.aw.closeShell(adding.pty)
    setAdding(null)
  }
  const begin = async (id: string, name: string, provider: ProviderId) => {
    if (adding?.pty) window.aw.closeShell(adding.pty)
    setAdding({ step: 'sign-in', provider, name, id, pty: await window.aw.openSignIn(provider, id), checking: false })
  }
  const create = async () => {
    if (!adding) return
    setError('')
    try {
      const id = await window.aw.addAccount(adding.provider, adding.name)
      onChange({ accounts: [...prefs.accounts, { id, name: adding.name.trim(), provider: adding.provider }] })
      await begin(id, adding.name.trim(), adding.provider)
    } catch (e) {
      setError((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    }
  }
  const check = async () => {
    if (!adding) return
    setAdding({ ...adding, checking: true })
    const now = await window.aw.listAccounts()
    setList(now)
    const me = now.find((x) => x.id === adding.id)
    if (me?.loggedIn) stop()
    else {
      setAdding({ ...adding, checking: false })
      setError('Not signed in yet. Finish in the terminal and the browser, then check again.')
    }
  }
  const remove = async (id: string) => {
    setError('')
    try {
      const next = await window.aw.removeAccount(id)
      onChange({ accounts: next.accounts, defaults: next.defaults })
    } catch (e) {
      setError((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    }
  }

  return (
    <>
      <legend>Accounts</legend>
      <p className="set-lead">Sign each subscription in once. Agents can then move between them from their profile card without signing in again. Your own login on this computer is never changed.</p>
      <p className="set-note">The default account is used for every agent you hire. You can change it at any time from an agent's profile card, so no account choice is ever locked in.</p>
      {keepers.map((p) => (
        <div key={p.id} className="acct-group">
          {keepers.length > 1 && <ProviderTag id={p.id} label={p.label} />}
          <div className="acct-list">
            {(list ?? [{ id: '', name: 'This computer', provider: p.id, dir: '', loggedIn: true, email: '', agents: 0 }]).filter((x) => x.provider === p.id).map((x) => {
              const isDefault = (prefs.defaults.accounts[x.provider] ?? '') === x.id
              return (
                <div key={x.id} className="acct" data-default={isDefault} style={{ ['--c' as string]: accountColor(prefs.accounts, x.id) }}>
                  <i className="dot" aria-hidden="true" />
                  <div className="who">
                    <b>
                      {x.name}
                      {isDefault && <span className="acct-tag">Default for new agents</span>}
                    </b>
                    <span>{list ? (x.loggedIn ? x.email || 'Signed in' : 'Not signed in') : 'Checking…'}</span>
                    <small>
                      {x.dir}
                      {x.agents > 0 && ` · ${x.agents} ${x.agents === 1 ? 'agent' : 'agents'}`}
                    </small>
                  </div>
                  <div className="acts">
                    {list && <span className="acct-state" data-ok={x.loggedIn}>{x.loggedIn ? 'Signed in' : 'Sign in needed'}</span>}
                    {list && !x.loggedIn && x.id && <button onClick={() => void begin(x.id, x.name, x.provider)}>Sign in</button>}
                    {list && x.loggedIn && (() => {
                      const elsewhere = list.filter((y) => y.provider === x.provider).reduce((n, y) => n + y.agents, 0) - x.agents
                      return <button onClick={() => setSwitching({ id: x.id, name: x.name })} disabled={elsewhere <= 0} title={elsewhere <= 0 ? 'Every agent is already on this account' : 'Move every agent to this account, stopping and continuing the ones that are working'}>Switch all agents here</button>
                    })()}
                    {!isDefault && <button onClick={() => onChange({ defaults: { ...prefs.defaults, accounts: { ...prefs.defaults.accounts, [x.provider]: x.id } } })}>Make default</button>}
                    {x.id && <button onClick={() => void remove(x.id)}>Remove</button>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
      {switching && <SwitchAgentsDialog account={switching} providers={providers} onClose={() => (setSwitching(null), void refresh())} />}
      {error && <p className="acct-error" role="alert">{error}</p>}
      {!adding && (
        <div className="settings-row">
          <button className="primary" onClick={() => (setError(''), setAdding({ step: 'name', provider: keepers[0]?.id ?? 'claude', name: '', id: '', pty: '', checking: false }))}>Add account</button>
        </div>
      )}
      {adding?.step === 'name' && (
        <form className="acct-add" onSubmit={(e) => (e.preventDefault(), void create())}>
          {keepers.length > 1 && (
            <label>
              Program
              <select value={adding.provider} onChange={(e) => setAdding({ ...adding, provider: e.target.value as ProviderId })}>
                {keepers.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </label>
          )}
          <label>
            Name
            <input value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} placeholder="Work, Personal, Client…" maxLength={40} autoFocus />
            <span className="hint">Only a label for you. The sign-in decides which subscription it is.</span>
          </label>
          <div className="settings-row">
            <button type="submit" className="primary" disabled={!adding.name.trim()}>Continue to sign in</button>
            <button type="button" onClick={stop}>Cancel</button>
          </div>
        </form>
      )}
      {adding?.step === 'sign-in' && (
        <div className="acct-add">
          <p className="set-lead">Signing in <b>{adding.name}</b>. Finish in the terminal and your browser; this is the only time. The app never sees what you type.</p>
          <div className="su-term"><TerminalView ptyId={adding.pty} visible focusTick={0} /></div>
          <div className="settings-row">
            <button className="primary" disabled={adding.checking} onClick={() => void check()}>{adding.checking ? 'Checking…' : 'I have signed in: check'}</button>
            <button onClick={stop}>Close</button>
          </div>
        </div>
      )}
    </>
  )
}
