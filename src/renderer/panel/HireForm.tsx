import { useEffect, useRef, useState } from 'react'
import type { BranchList } from '../../shared/api'
import type { LibraryPreview } from '../../shared/library'
import type { Role } from '../../shared/roles'
import type { AgentOptions, Effort, HireLeftover, PermissionMode, Prefs, ProviderId, ProviderInfo } from '../../shared/types'
import { effortsFor } from '../../shared/efforts'
import { parsePick } from '../../shared/modelPick'
import { cssColor } from '../../shared/brand'
import { BasePicker } from './BasePicker'
import { PixelSprite } from './PixelSprite'
import { accountColor, accountName, chosenAccount } from '../accounts'

export const MODELS = [
  { value: '', label: 'Default model' },
  { value: 'opus', label: 'Opus' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'haiku', label: 'Haiku' },
  { value: 'fable', label: 'Fable' }
]
export const EFFORTS: { value: Effort | ''; label: string }[] = [
  { value: '', label: 'Default effort' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'Extra high' },
  { value: 'max', label: 'Max' }
]

/** Everything Claude lets you choose at launch, before the agent walks in. */
export function HireForm({
  providers,
  unready,
  onSetUp,
  defaultProvider,
  roles,
  defaults,
  roleModels,
  accounts,
  own,
  folder,
  onHire,
  onCancel,
  onSaveRole
}: {
  /** The programs that are ready here; the choice shows only when there is more than one. */
  providers: ProviderInfo[]
  /** The programs that are not ready (not installed, or not signed in): shown greyed, each with a way to set it up. */
  unready: ProviderInfo[]
  onSetUp: (id: ProviderId) => void
  defaultProvider: ProviderId | ''
  roles: Role[]
  /** From Settings: what a new agent starts with. */
  defaults: Prefs['defaults']
  /** From Settings: the model a job uses when its role does not name one. */
  roleModels: Prefs['roleModels']
  /** The extra Claude accounts from Settings; the choice shows only when there is one. */
  accounts: Prefs['accounts']
  /** The names given to the programs' own logins. */
  own?: Prefs['ownNames']
  /** The project the agent is hired into, to offer its branches. */
  folder: string
  /** `base` is set only when another branch than the folder's own was chosen; `leftover` says what to do with one an earlier agent left under the name. A refusal is shown in this form. */
  onHire: (options: AgentOptions, name: string, base?: string, leftover?: 'replace' | 'reuse') => Promise<void>
  onCancel: () => void
  onSaveRole: (title: string, options: AgentOptions) => Promise<void>
}) {
  const [roleId, setRoleId] = useState('')
  const [provider, setProvider] = useState<ProviderId | ''>(defaultProvider)
  const chosen = providers.find((p) => p.id === provider) ?? providers[0]
  const models = chosen?.models ?? MODELS
  const modes = chosen?.hireModes ?? [{ value: '', label: 'Default', hint: '' }]
  const [saving, setSaving] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [model, setModel] = useState(models.some((m) => m.value === defaults.model) ? defaults.model : '')
  const [effort, setEffort] = useState<Effort | ''>('')
  const efforts = effortsFor(models, model)
  const [mode, setMode] = useState<string>(defaults.permissionMode)
  const [budget, setBudget] = useState('')
  const [instructions, setInstructions] = useState('')
  const [chrome, setChrome] = useState(false)
  const [remote, setRemote] = useState(false)
  const [inPlace, setInPlace] = useState(defaults.inPlace)
  // The branch the agent starts from and lands on: the folder's own unless another is chosen. Nothing is offered outside a git repo.
  const [repo, setRepo] = useState<BranchList>({ current: '', branches: [] })
  const [base, setBase] = useState('')
  useEffect(() => {
    void window.aw.repoBranches(folder).then(setRepo, () => undefined)
  }, [folder])
  // The accounts of the program that will run it; the one chosen in Settings for that program starts selected.
  const mine = accounts.filter((a) => a.provider === chosen?.id)
  const [picked, setAccount] = useState<string | null>(null)
  const account = chosenAccount(mine, picked, defaults.accounts[chosen?.id as ProviderId])
  const [busy, setBusy] = useState(false)
  // What the project's playbook would give this agent, so hiring shows what it will be told.
  const [lib, setLib] = useState<LibraryPreview | null>(null)
  const [libOpen, setLibOpen] = useState(false)
  useEffect(() => void window.aw.library.preview(folder, chosen?.id ?? 'claude').then(setLib, () => setLib(null)), [folder, chosen?.id])

  // Picking a role fills in the launch settings for that job; everything stays editable.
  const applyRole = (id: string) => {
    setRoleId(id)
    const r = roles.find((x) => x.id === id)
    if (!r) return
    const o = r.options
    // A job's model may name a program (set in Settings); a role's own model is a Claude alias, kept only where the program lists it.
    const job = roleModels[r.title] ? parsePick(roleModels[r.title]!) : null
    const target = job && providers.some((p) => p.id === job.provider) ? job.provider : chosen?.id
    const listed = providers.find((p) => p.id === target)?.models ?? []
    if (job && target === job.provider) setProvider(job.provider)
    const wanted = o.model ?? job?.model ?? ''
    setModel(listed.some((m) => m.value === wanted) ? wanted : '')
    setEffort(o.effort && effortsFor(listed, wanted).includes(o.effort) ? o.effort : '')
    setMode(o.permissionMode ?? '')
    setInstructions(o.instructions ?? '')
    setChrome(!!o.chrome)
    setRemote(!!o.remote)
    if (r.nameHint && !name.trim()) setName(r.nameHint)
  }
  const current = (): AgentOptions => {
    const budgetUsd = Number.parseFloat(budget)
    return {
      ...(providers.length > 1 && chosen && { provider: chosen.id }),
      ...(model && { model }),
      ...(effort && efforts.includes(effort) && { effort }),
      ...(mode && modes.some((m) => m.value === mode) && { permissionMode: mode as PermissionMode }),
      ...(budgetUsd > 0 && chosen?.capabilities.budget !== false && { budgetUsd }),
      ...(instructions.trim() && { instructions: instructions.trim() }),
      ...(chrome && chosen?.capabilities.chrome !== false && { chrome }),
      ...(remote && chosen?.capabilities.remote && { remote }),
      ...(inPlace && { inPlace }),
      ...(mine.length > 0 && { account }),
      ...(roles.find((r) => r.id === roleId) && { role: roles.find((r) => r.id === roleId)!.title })
    }
  }

  // A branch or folder an earlier agent left under this name, looked for as the name settles, so it is said before Hire is pressed.
  const [left, setLeft] = useState<HireLeftover | null>(null)
  const [sure, setSure] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    setSure(false)
    setError('')
    if (!name.trim()) return setLeft(null)
    const t = setTimeout(() => void window.aw.hireLeftover(folder, name, inPlace).then(setLeft, () => setLeft(null)), 250)
    return () => clearTimeout(t)
  }, [folder, name, inPlace])

  const submit = async (leftover?: 'replace' | 'reuse') => {
    setBusy(true)
    setError('')
    try {
      await onHire(current(), name, !inPlace && base && base !== repo.current ? base : undefined, leftover)
    } catch (err) {
      setError((err instanceof Error ? err.message : String(err)).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
      // The name may have been taken or freed meanwhile.
      void window.aw.hireLeftover(folder, name, inPlace).then(setLeft, () => setLeft(null))
    } finally {
      setBusy(false)
    }
  }

  const modelLabel = models.find((m) => m.value === model)?.label ?? 'Default model'
  const modeChosen = modes.find((m) => m.value === mode) ?? modes[0]!
  const who = name.trim() || 'a new hire'
  // The look follows the name, as it does in the office.
  const look = name.trim() || 'New hire'
  return (
    <form
      className="hire hire-v2"
      aria-label="Hire an agent"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
      onKeyDown={(e) => e.key === 'Escape' && onCancel()}
    >
      <div className="hire-hero">
        <span className="hire-avatar"><PixelSprite name={look} role="senior" scale={3} /></span>
        {/* The summary sits beside the label, not in it: it names the model, and a label that says "Model" is the Model field's. */}
        <div className="hire-name">
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="auto" autoFocus maxLength={20} />
          </label>
          {left && <LeftoverNotice left={left} busy={busy} sure={sure} onAsk={setSure} onChoose={(c) => void submit(c)} />}
          <span className="hint">{chosen?.label} · {modelLabel} · {modeChosen.label}</span>
        </div>
      </div>
      {providers.length + unready.length > 1 && (
        <fieldset className="hire-pick">
          <legend>Provider <em>what runs the agent</em></legend>
          <div className="hire-opts">
            {providers.map((p) => (
              <label key={p.id} className="hire-opt" data-on={chosen?.id === p.id} style={{ ['--c' as string]: cssColor(p.id) }}>
                <input type="radio" name="provider" value={p.id} checked={chosen?.id === p.id} onChange={() => (setProvider(p.id), setModel(''), setMode(''))} />
                <b><i className="dot" />{p.label}</b>
                <span className="hint">{p.detection.version ? `ready · ${p.detection.version}` : 'ready'}</span>
              </label>
            ))}
            {unready.map((p) => (
              <label key={p.id} className="hire-opt locked" data-on={false} style={{ ['--c' as string]: cssColor(p.id) }}>
                <input type="radio" name="provider" value={p.id} disabled checked={false} readOnly />
                <b><i className="dot" />{p.label}</b>
                <span className="hint">{p.detection.state === 'needs-sign-in' ? 'not signed in' : 'not installed'}</span>
                <button type="button" className="su-link" onClick={() => onSetUp(p.id)}>Set up {p.label.split(' ')[0]} →</button>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {mine.length > 0 && (
        <fieldset className="hire-pick">
          <legend>Account <em>which login it runs on</em></legend>
          <div className="hire-opts">
            {['', ...mine.map((a) => a.id)].map((id) => (
              <label key={id} className="hire-opt" data-on={account === id} style={{ ['--c' as string]: accountColor(accounts, id) }}>
                <input type="radio" name="account" value={id} checked={account === id} onChange={() => setAccount(id)} />
                <b><i className="dot" />{accountName(accounts, id, chosen?.id ?? '', own)}</b>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="hire-row">
        <label className="grow">
          Role
          <select value={roleId} onChange={(e) => applyRole(e.target.value)}>
            <option value="">Blank agent</option>
            {(['built-in', 'project', 'your', 'saved'] as const).map((src) => {
              const list = roles.filter((r) => r.source === src)
              return list.length ? (
                <optgroup key={src} label={{ 'built-in': 'Ready-made', project: "This project's agents", your: 'Your Claude agents', saved: 'Saved by you' }[src]}>
                  {list.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                    </option>
                  ))}
                </optgroup>
              ) : null
            })}
          </select>
          <span className="hint">{roles.find((r) => r.id === roleId)?.blurb ?? 'Start from a ready-made job, or set everything yourself'}</span>
        </label>
      </div>
      <div className="hire-row">
        <label className="grow">
          Model
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            {models.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        {efforts.length > 0 ? (
          <label>
            Effort
            <select value={efforts.includes(effort) ? effort : ''} onChange={(e) => setEffort(e.target.value as Effort | '')}>
              {EFFORTS.filter((m) => !m.value || efforts.includes(m.value)).map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="hire-note">{chosen?.label} sets thinking inside the model's name, so there is no separate effort.</p>
        )}
        {chosen?.capabilities.budget !== false && (
          <label>
            Budget (USD)
            <input value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="decimal" placeholder="none" aria-describedby="budget-hint" />
            <span className="hint" id="budget-hint">
              Warns at 80% and 100%
            </span>
          </label>
        )}
      </div>
      <fieldset className="hire-pick">
        <legend>Permissions <em>what it may do without asking</em></legend>
        <div className="hire-opts">
          {modes.map((m) => (
            <label key={m.value} className="hire-opt" data-on={modeChosen.value === m.value} data-risk={m.value === 'skip-permissions' || m.value === 'bypassPermissions'}>
              <input type="radio" name="permissions" value={m.value} checked={modeChosen.value === m.value} onChange={() => setMode(m.value)} />
              <b>{m.label}</b>
              <span className="hint">{m.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label>
        Extra instructions
        <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={2} placeholder="Added to the agent's instructions, e.g. prefer small commits" />
      </label>
      <div className="hire-row hire-checks">
        {chosen?.capabilities.chrome !== false && (
          <label className="check">
            <input type="checkbox" checked={chrome} onChange={(e) => setChrome(e.target.checked)} /> Let it use Chrome
          </label>
        )}
        <label className="check" title="No worktree and no aw/ branch: the agent edits your folder directly, so other agents on it can overwrite each other">
          <input type="checkbox" checked={inPlace || !!repo.unborn} disabled={!!repo.unborn} onChange={(e) => setInPlace(e.target.checked)} /> Work in my folder directly (no branch)
        </label>
      </div>
      {chosen?.capabilities.remote && (
        <label className="hire-switch">
          <input type="checkbox" role="switch" checked={remote} onChange={(e) => setRemote(e.target.checked)} />
          <span className="sw" aria-hidden="true" />
          <span><b>Remote control</b><span className="hint">Continue this agent from your phone.{chosen.remoteNote ? ` ${chosen.remoteNote}` : ''}</span></span>
        </label>
      )}
      {repo.unborn && (
        <p className="hint" role="note" aria-label="No commits yet">
          This repository has no commits yet, so the agent works in the folder itself. Once it has a first commit, new agents get a branch of their own.
        </p>
      )}
      {!inPlace && repo.branches.length > 0 && (
        <div className="hire-row hire-base">
          <span>Branch from</span>
          <BasePicker value={base || repo.current} label="Branch from" load={() => Promise.resolve(repo)} onPick={setBase} note="The agent works on its own branch, started from this one, and lands back on it." />
          {(base || repo.current) === repo.current && <small>this folder's branch</small>}
        </div>
      )}
      {lib && lib.rules.some((r) => r.mode !== 'off') && (
        <div className="lib-notice" role="note" aria-label="The library for this agent">
          <div>
            <b>Uses the {folder.split('/').pop()} playbook.</b>
            <span>{lib.rules.filter((r) => r.mode === 'always').length} told every time, {lib.rules.filter((r) => r.mode === 'on-demand').length} pointed at. About {lib.coreTokens} tokens at the start.</span>
            <div className="actions"><button type="button" aria-expanded={libOpen} onClick={() => setLibOpen((o) => !o)}>{libOpen ? 'Hide what it is told' : 'See what it is told'}</button></div>
            {libOpen && <pre className="lib-body">{lib.core || '(nothing: no rules apply here)'}</pre>}
          </div>
        </div>
      )}
      {error && <p className="hire-error" role="alert">{error}</p>}
      <div className="hire-foot">
        <span className="hire-sum">Hiring <b>{who}</b> on <b>{chosen?.label}</b> with <b>{modelLabel}</b></span>
        {saving === null ? (
          <button type="button" onClick={() => setSaving('')} title="Keep these settings as a role you can pick again">
            Save as role…
          </button>
        ) : (
          <span className="save-role">
            <input value={saving} onChange={(e) => setSaving(e.target.value)} placeholder="Role name" aria-label="Role name" maxLength={40} autoFocus />
            <button type="button" disabled={!saving.trim()} onClick={() => void onSaveRole(saving, current()).then(() => setSaving(null))}>
              Save
            </button>
          </span>
        )}
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="primary" disabled={busy || !!left} title={left ? `Choose what to do with ${left.branch} above first` : undefined}>
          {busy ? 'Hiring…' : 'Hire'}
        </button>
      </div>
    </form>
  )
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** What an earlier agent left under the name, and what can be done: delete it and hire fresh, or hire onto it. */
function LeftoverNotice({ left, busy, sure, onAsk, onChoose }: { left: HireLeftover; busy: boolean; sure: boolean; onAsk: (v: boolean) => void; onChoose: (c: 'replace' | 'reuse') => void }) {
  const what = [left.unmerged > 0 && `${plural(left.unmerged, 'commit', 'commits')} not merged`, left.dirty > 0 && (left.registered ? plural(left.dirty, 'file', 'files') + ' with uncommitted changes' : plural(left.dirty, 'item', 'items') + ' in a folder git does not know')].filter(Boolean) as string[]
  const lossy = what.length > 0
  // The form scrolls: bring the notice (and its buttons) into view when it appears or asks to be sure.
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    box.current?.scrollIntoView?.({ block: 'nearest' })
  }, [sure, left.branch])
  const cannotReuse = !left.hasBranch ? 'There is no branch left to carry on from.' : left.hasFolder && !left.registered ? 'Its folder is not one git knows, so it cannot be used.' : ''
  return (
    <div className="hire-left" ref={box} role="alert" aria-label="Left over from an earlier agent">
      <span className="hire-left-tag">{left.inUse ? 'In use' : 'Left over'}</span>
      {left.inUse ? (
        <p><b>{left.branch}</b> is still used by {left.inUse}. Pick another name.</p>
      ) : (
        <>
          <p><b>{left.branch}</b> is left over from an earlier agent{lossy ? `: ${what.join(', ')}.` : '. There is no work in it.'}</p>
          {sure ? (
            <p>This deletes {left.branch}{lossy ? ` with ${what.join(' and ')}` : ''}. It cannot be undone for the uncommitted files.</p>
          ) : null}
          <div className="hire-left-acts">
            {sure ? (
              <>
                <button type="button" className="danger" disabled={busy} onClick={() => onChoose('replace')}>Delete it and hire</button>
                <button type="button" onClick={() => onAsk(false)}>Keep it</button>
              </>
            ) : (
              <>
                <button type="button" disabled={busy} onClick={() => (lossy ? onAsk(true) : onChoose('replace'))}>Remove it and hire</button>
                <button type="button" className="primary" disabled={busy || !!cannotReuse} title={cannotReuse || `Hire onto ${left.branch}, with the work in it`} onClick={() => onChoose('reuse')}>Hire on it</button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
