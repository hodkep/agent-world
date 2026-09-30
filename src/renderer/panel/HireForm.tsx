import { useState } from 'react'
import type { Role } from '../../shared/roles'
import type { AgentOptions, Effort, PermissionMode } from '../../shared/types'

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
const MODES: { value: PermissionMode | ''; label: string; hint: string }[] = [
  { value: '', label: "Claude's default", hint: 'Usually auto: a classifier approves safe actions' },
  { value: 'manual', label: 'Ask for everything', hint: 'Every edit, command and fetch waits for your approval' },
  { value: 'acceptEdits', label: 'Accept edits', hint: 'File edits go through; commands still ask' },
  { value: 'plan', label: 'Plan first', hint: 'Reads and plans; asks before changing anything' },
  { value: 'auto', label: 'Auto', hint: 'A classifier reviews each action instead of you' },
  { value: 'dontAsk', label: "Don't ask", hint: 'Only pre-allowed tools run; the rest are denied' }
]

/** Everything Claude lets you choose at launch, before the agent walks in. */
export function HireForm({
  roles,
  onHire,
  onCancel,
  onSaveRole
}: {
  roles: Role[]
  onHire: (options: AgentOptions, name: string) => Promise<void>
  onCancel: () => void
  onSaveRole: (title: string, options: AgentOptions) => Promise<void>
}) {
  const [roleId, setRoleId] = useState('')
  const [saving, setSaving] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [model, setModel] = useState('')
  const [effort, setEffort] = useState<Effort | ''>('')
  const [mode, setMode] = useState<PermissionMode | ''>('')
  const [budget, setBudget] = useState('')
  const [instructions, setInstructions] = useState('')
  const [chrome, setChrome] = useState(false)
  const [busy, setBusy] = useState(false)

  // Picking a role fills in the launch settings for that job; everything stays editable.
  const applyRole = (id: string) => {
    setRoleId(id)
    const r = roles.find((x) => x.id === id)
    if (!r) return
    const o = r.options
    setModel(o.model ?? '')
    setEffort(o.effort ?? '')
    setMode(o.permissionMode ?? '')
    setInstructions(o.instructions ?? '')
    setChrome(!!o.chrome)
    if (r.nameHint && !name.trim()) setName(r.nameHint)
  }
  const current = (): AgentOptions => {
    const budgetUsd = Number.parseFloat(budget)
    return {
      ...(model && { model }),
      ...(effort && { effort }),
      ...(mode && { permissionMode: mode }),
      ...(budgetUsd > 0 && { budgetUsd }),
      ...(instructions.trim() && { instructions: instructions.trim() }),
      ...(chrome && { chrome }),
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
            {MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Effort
          <select value={effort} onChange={(e) => setEffort(e.target.value as Effort | '')}>
            {EFFORTS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="hire-row">
        <label className="grow">
          Permissions
          <select value={mode} onChange={(e) => setMode(e.target.value as PermissionMode | '')}>
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <span className="hint">{MODES.find((m) => m.value === mode)!.hint}</span>
        </label>
        <label>
          Budget (USD)
          <input value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="decimal" placeholder="none" aria-describedby="budget-hint" />
          <span className="hint" id="budget-hint">
            Warns at 80% and 100%
          </span>
        </label>
      </div>
      <label>
        Extra instructions
        <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={2} placeholder="Appended to Claude's system prompt, e.g. prefer small commits" />
      </label>
      <div className="hire-row">
        <label className="check">
          <input type="checkbox" checked={chrome} onChange={(e) => setChrome(e.target.checked)} /> Let it use Chrome
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
