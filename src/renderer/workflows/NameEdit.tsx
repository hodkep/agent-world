import { useState } from 'react'

/** A workflow's name with a Rename button; pressing it turns the name into a field (Enter or Save keeps it, Escape or Cancel leaves it as it was). */
export function NameEdit({ name, onSave, disabled, stop }: { name: string; onSave: (next: string) => Promise<unknown>; disabled?: boolean; stop?: string }) {
  const [typed, setTyped] = useState<string | null>(null)
  // `stop` changes when the screen moves to another workflow: a half-typed name is not carried over.
  const [at, setAt] = useState(stop)
  if (at !== stop) (setAt(stop), setTyped(null))
  if (typed === null) {
    return (
      <>
        <b>{name}</b>
        <button type="button" className="wfl-rn" aria-label={`Rename ${name}`} title="Rename" disabled={disabled} onClick={() => setTyped(name)}>Rename</button>
      </>
    )
  }
  const next = typed.trim()
  return (
    <form className="wfl-rename" onSubmit={(ev) => (ev.preventDefault(), next && next !== name ? void onSave(next).then(() => setTyped(null), () => undefined) : setTyped(null))}>
      <input autoFocus value={typed} maxLength={60} aria-label="Workflow name" onChange={(ev) => setTyped(ev.target.value)} onKeyDown={(ev) => ev.key === 'Escape' && (ev.preventDefault(), ev.stopPropagation(), setTyped(null))} />
      <button className="primary" type="submit" disabled={!next || next === name}>Save</button>
      <button type="button" onClick={() => setTyped(null)}>Cancel</button>
    </form>
  )
}
