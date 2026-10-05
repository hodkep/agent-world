import { useState } from 'react'
import type { Role } from '../../shared/roles'
import type { AgentOptions, Effort, PermissionMode, Prefs, ProviderId, ProviderInfo } from '../../shared/types'
import { effortsFor } from '../../shared/efforts'
import { parsePick } from '../../shared/modelPick'

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
  defaultProvider,
  roles,
  defaults,
  roleModels,
  onHire,
  onCancel,
  onSaveRole
}: {
  /** The programs that are ready here; the choice shows only when there is more than one. */
  providers: ProviderInfo[]
  defaultProvider: ProviderId | ''
  roles: Role[]
  /** From Settings: what a new agent starts with. */
  defaults: Prefs['defaults']
  /** From Settings: the model a job uses when its role does not name one. */
  roleModels: Prefs['roleModels']
  onHire: (options: AgentOptions, name: string) => Promise<void>
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
  const [inPlace, setInPlace] = useState(defaults.inPlace)
  const [busy, setBusy] = useState(false)

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
      ...(inPlace && { inPlace }),
      ...(roles.find((r) => r.id === roleId) && { role: roles.find((r) => r.id === roleId)!.title })
    }
  }

  const submit = async () => {
    setBusy(true)
    try {
      await onHire(current(), name)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="hire"
      aria-label="Hire an agent"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
      onKeyDown={(e) => e.key === 'Escape' && onCancel()}
    >
      {providers.length > 1 && (
        <div className="hire-row">
          <label className="grow">
            Provider
            <select value={chosen?.id} onChange={(e) => (setProvider(e.target.value as ProviderId), setModel(''), setMode(''))}>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>
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
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="auto" autoFocus maxLength={20} />
        </label>
        <label>
          Model
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            {models.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        {efforts.length > 0 && (
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
        )}
      </div>
      <div className="hire-row">
        <label className="grow">
          Permissions
          <select value={modes.some((m) => m.value === mode) ? mode : ''} onChange={(e) => setMode(e.target.value)}>
            {modes.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <span className="hint">{(modes.find((m) => m.value === mode) ?? modes[0]!).hint}</span>
        </label>
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
      <label>
        Extra instructions
        <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={2} placeholder="Added to the agent's instructions, e.g. prefer small commits" />
      </label>
      <div className="hire-row">
        {chosen?.capabilities.chrome !== false && (
          <label className="check">
            <input type="checkbox" checked={chrome} onChange={(e) => setChrome(e.target.checked)} /> Let it use Chrome
          </label>
        )}
        <label className="check" title="No worktree and no aw/ branch: the agent edits your folder directly, so other agents on it can overwrite each other">
          <input type="checkbox" checked={inPlace} onChange={(e) => setInPlace(e.target.checked)} /> Work in my folder directly (no branch)
        </label>
        {saving === null ? (
          <button type="button" onClick={() => setSaving('')} title="Keep these settings as a role you can pick again">
            Save as role…
          </button>
        ) : (
          <span className="save-role">
            <input value={saving} onChange={(e) => setSaving(e.target.value)} placeholder="Role name" aria-label="Role name" maxLength={40} autoFocus />
            <button
              type="button"
              disabled={!saving.trim()}
              onClick={() => void onSaveRole(saving, current()).then(() => setSaving(null))}
            >
              Save
            </button>
          </span>
        )}
        <button type="button" className="push" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Hiring…' : 'Hire'}
        </button>
      </div>
    </form>
  )
}
