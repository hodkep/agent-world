import { useState } from 'react'
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
export function HireForm({ onHire, onCancel }: { onHire: (options: AgentOptions, name: string) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [model, setModel] = useState('')
  const [effort, setEffort] = useState<Effort | ''>('')
  const [mode, setMode] = useState<PermissionMode | ''>('')
  const [budget, setBudget] = useState('')
  const [instructions, setInstructions] = useState('')
  const [chrome, setChrome] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    try {
      const budgetUsd = Number.parseFloat(budget)
      await onHire(
        {
          ...(model && { model }),
          ...(effort && { effort }),
          ...(mode && { permissionMode: mode }),
          ...(budgetUsd > 0 && { budgetUsd }),
          ...(instructions.trim() && { instructions: instructions.trim() }),
          ...(chrome && { chrome })
        },
        name
      )
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
