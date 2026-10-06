import { useEffect, useRef, useState } from 'react'
import type { BranchList } from '../../shared/api'

const clean = (e: unknown) => (e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))

/**
 * The branch an agent's work is compared with and lands on, as a button that opens a list of the repo's branches.
 * `load` reads the list when it opens, `onPick` is told the choice; the button names the branch in use.
 */
export function BasePicker({ value, load, onPick, label, note }: { value: string; load: () => Promise<BranchList>; onPick: (branch: string) => Promise<void> | void; label: string; note: string }) {
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<BranchList | null>(null)
  const [q, setQ] = useState('')
  const [error, setError] = useState('')
  const wrap = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    setQ('')
    setError('')
    void load().then(setList, (e) => setError(clean(e)))
    const away = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), setOpen(false))
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', esc, true)
    return () => {
      window.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', esc, true)
    }
  }, [open, load])
  const pick = async (name: string) => {
    if (name === value) return setOpen(false)
    try {
      await onPick(name)
      setOpen(false)
    } catch (e) {
      setError(clean(e))
    }
  }
  const shown = (list?.branches ?? []).filter((b) => b.name.toLowerCase().includes(q.trim().toLowerCase()))
  const group = (kind: 'local' | 'remote') => shown.filter((b) => b.kind === kind)
  return (
    <span className="bp" ref={wrap}>
      <button type="button" className={`bp-btn ${open ? 'open' : ''}`} aria-haspopup="listbox" aria-expanded={open} aria-label={`${label}: ${value}`} title={label} onClick={() => setOpen((o) => !o)}>
        <span>{value || 'default'}</span>
      </button>
      {open && (
        <div className="bp-pop" role="dialog" aria-label={label}>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a branch…" aria-label="Find a branch" />
          <div role="listbox" aria-label="Branches">
            {(['local', 'remote'] as const).map((k) =>
              group(k).length ? (
                <div key={k}>
                  <h4>{k === 'local' ? 'Local' : 'Remote'}</h4>
                  {group(k).map((b) => (
                    <button key={b.name} type="button" role="option" aria-selected={b.name === value} className={`bp-opt ${b.name === value ? 'cur' : ''}`} onClick={() => void pick(b.name)}>
                      <span>{b.name}</span>
                      <small>{b.name === value ? 'in use' : b.checkedOut ? 'checked out' : ''}</small>
                    </button>
                  ))}
                </div>
              ) : null
            )}
            {list && shown.length === 0 && <p className="bp-none">No branch matches.</p>}
            {!list && !error && <p className="bp-none">Loading…</p>}
          </div>
          {error && <p className="bp-err" role="alert">{error}</p>}
          <p className="bp-fine">{note}</p>
        </div>
      )}
    </span>
  )
}
