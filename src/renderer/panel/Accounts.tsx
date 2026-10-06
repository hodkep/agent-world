import { useCallback, useEffect, useState } from 'react'
import type { AccountInfo, Prefs } from '../../shared/types'
import { accountColor } from '../accounts'
import { TerminalView } from './TerminalView'

/** Settings › Accounts: each Claude subscription is signed in once, in a folder of its own, and agents can then move between them without signing in again. */
export function Accounts({ prefs, onChange }: { prefs: Prefs; onChange: (patch: Partial<Prefs>) => void }) {
  const [list, setList] = useState<AccountInfo[] | null>(null)
  const [error, setError] = useState('')
  // The add flow: a name, then the account's own sign-in in a terminal the user can see.
  const [adding, setAdding] = useState<{ step: 'name' | 'sign-in'; name: string; id: string; pty: string; checking: boolean } | null>(null)
  const refresh = useCallback(() => window.aw.listAccounts().then(setList), [])
  useEffect(() => void refresh(), [refresh, prefs.accounts])

  const stop = () => {
    if (adding?.pty) window.aw.closeShell(adding.pty)
    setAdding(null)
  }
  const begin = async (id: string, name: string) => {
    if (adding?.pty) window.aw.closeShell(adding.pty)
    setAdding({ step: 'sign-in', name, id, pty: await window.aw.openSignIn('claude', id), checking: false })
  }
  const create = async () => {
    if (!adding) return
    setError('')
    try {
      const id = await window.aw.addAccount(adding.name)
      onChange({ accounts: [...prefs.accounts, { id, name: adding.name.trim() }] })
      await begin(id, adding.name.trim())
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
      <p className="set-lead">Sign each Claude subscription in once. Agents can then move between them from their profile card without signing in again. Your own login on this computer is never changed.</p>
      <p className="set-note">The default account is used for every agent you hire. You can change it at any time from an agent's profile card, so no account choice is ever locked in.</p>
      <div className="acct-list">
        {(list ?? [{ id: '', name: 'This computer', dir: '~/.claude', loggedIn: true, email: '', agents: 0 }]).map((x) => {
          const isDefault = prefs.defaults.account === x.id
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
                {list && !x.loggedIn && x.id && <button onClick={() => void begin(x.id, x.name)}>Sign in</button>}
                {!isDefault && <button onClick={() => onChange({ defaults: { ...prefs.defaults, account: x.id } })}>Make default</button>}
                {x.id && <button onClick={() => void remove(x.id)}>Remove</button>}
              </div>
            </div>
          )
        })}
      </div>
      {error && <p className="acct-error" role="alert">{error}</p>}
      {!adding && (
        <div className="settings-row">
          <button className="primary" onClick={() => (setError(''), setAdding({ step: 'name', name: '', id: '', pty: '', checking: false }))}>Add account</button>
        </div>
      )}
      {adding?.step === 'name' && (
        <form className="acct-add" onSubmit={(e) => (e.preventDefault(), void create())}>
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
