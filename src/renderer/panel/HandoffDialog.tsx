import { BRAND } from '../../shared/brand'
import { DEFAULT_PROVIDER } from '../../shared/types'
import { useState } from 'react'
import { type HandoffKind, handoffText } from '../../shared/handoff'
import type { AgentRecord, ProviderId, ProviderInfo } from '../../shared/types'
import { Modal } from './Modal'
import { Swatch } from './ProviderTag'

const KINDS: { id: HandoffKind; label: string; blurb: string }[] = [
  { id: 'review', label: 'Review', blurb: 'Reads the changes, reports findings. Edits nothing.' },
  { id: 'continue', label: 'Continue', blurb: 'Starts from my branch on a branch of their own and carries on.' },
  { id: 'answer', label: 'Answer', blurb: 'Takes one question and the files it is about.' }
]

type Target = { agent: string } | { hire: ProviderId }
interface Who {
  key: string
  to: Target
  name: string
  note: string
  provider: ProviderId
  label: string
  /** Why it cannot be picked, in words. */
  blocked?: string
}

/** Hand an agent's branch to another agent (or a hired one) to review, continue from, or answer a question about. Only agents that can answer through the message box are offered. */
export function HandoffDialog({ author, others, asleep, providers, onSend, onClose }: { author: AgentRecord; others: AgentRecord[]; asleep: (id: string) => boolean; providers: ProviderInfo[]; onSend: (to: Target, kind: HandoffKind, note: string) => Promise<boolean>; onClose: () => void }) {
  const info = (id: ProviderId | undefined) => providers.find((p) => p.id === (id ?? DEFAULT_PROVIDER))
  const canMail = (p?: ProviderInfo) => !!p && (p.mail === 'yes' || p.mail === 'connected')
  const who: Who[] = [
    ...others.map((a): Who => {
      const p = info(a.provider)
      return {
        key: a.id,
        to: { agent: a.id },
        name: a.name,
        note: a.branch ?? 'shared folder',
        provider: a.provider ?? DEFAULT_PROVIDER,
        label: p?.label ?? BRAND[DEFAULT_PROVIDER].short,
        blocked: asleep(a.id) ? 'asleep: wake it first' : canMail(p) ? undefined : 'not connected to the message box (Settings)'
      }
    }),
    ...providers
      .filter((p) => p.detection.state === 'ready')
      .map((p): Who => ({ key: `new:${p.id}`, to: { hire: p.id }, name: `Hire a new agent`, note: 'for this, on its own branch', provider: p.id, label: p.label, blocked: canMail(p) ? undefined : 'not connected to the message box (Settings)' }))
  ]
  const first = who.find((w) => !w.blocked)
  const [pick, setPick] = useState(first?.key ?? '')
  const [kind, setKind] = useState<HandoffKind>('review')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const chosen = who.find((w) => w.key === pick && !w.blocked)
  const preview = handoffText({ kind, from: author.name, branch: author.branch ?? '', base: author.base ?? '', worktree: author.cwd, note, fresh: !!chosen && 'hire' in chosen.to && kind === 'continue' })

  const send = async () => {
    if (!chosen) return
    setBusy(true)
    try {
      // It stays open when sending failed (the reason is shown in the window), so what was written is not lost.
      if (await onSend(chosen.to, kind, note)) onClose()
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal label={`Hand off ${author.name}'s work`} className="handoff" onClose={onClose}>
      <header className="settings-head">
        <b>Hand off {author.name}'s work</b>
        <span className="ho-branch">{author.branch}</span>
      </header>
      <div className="ho-body">
        <div className="ho-who" role="radiogroup" aria-label="Who gets it">
          <span className="ho-lbl">Who gets it</span>
          {who.map((w) => (
            <button key={w.key} className="ho-row" role="radio" aria-checked={pick === w.key} disabled={!!w.blocked} onClick={() => setPick(w.key)} title={w.blocked}>
              <i aria-hidden="true" />
              <span>
                <b>{w.name === 'Hire a new agent' ? `Hire a new ${w.label} agent` : w.name}</b> <small>{w.blocked ?? w.note}</small>
              </span>
              <Swatch id={w.provider} label={w.label} />
            </button>
          ))}
        </div>
        <div role="radiogroup" aria-label="What you want from them">
          <span className="ho-lbl">What you want from them</span>
          <div className="ho-kinds">
            {KINDS.map((k) => (
              <button key={k.id} className="ho-kind" role="radio" aria-checked={kind === k.id} onClick={() => setKind(k.id)}>
                <b>{k.label}</b>
                <small>{k.blurb}</small>
              </button>
            ))}
          </div>
        </div>
        <label className="ho-note">
          <span className="ho-lbl">Anything to add (optional)</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. the auth change is the risky part" maxLength={400} />
        </label>
        <div>
          <span className="ho-lbl">What they will be told</span>
          <pre className="ho-preview" aria-live="polite">{preview}</pre>
        </div>
        <div className="ho-actions">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={() => void send()} disabled={!chosen || busy}>
            Send hand-off
          </button>
        </div>
      </div>
    </Modal>
  )
}
