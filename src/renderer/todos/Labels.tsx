import { useState } from 'react'
import { LABEL_COLORS, type Label, type LabelColor, type TodoBoard } from '../../shared/todos'
import type { useConfirm } from '../panel/ConfirmDialog'

const colorOf = (labels: Label[] | undefined, name: string): LabelColor => labels?.find((l) => l.name === name)?.color ?? 'cyan'

/** A label as a small chip with its colour; with `onRemove` it can be taken off. */
export function LabelChip({ name, color, onRemove }: { name: string; color: LabelColor; onRemove?: () => void }) {
  return (
    <span className="lbl" data-c={color}>
      <i aria-hidden="true" />
      {name}
      {onRemove && <button type="button" aria-label={`Take off ${name}`} onClick={onRemove}>×</button>}
    </span>
  )
}

/** The labels a task has, as chips, with a menu to add one the board has or make a new one. */
export function TaskLabels({ board, names, onChange }: { board: TodoBoard; names: string[]; onChange: (names: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const free = (board.labels ?? []).filter((l) => !names.includes(l.name))
  const add = (n: string) => {
    const name = n.trim()
    if (!name) return
    // A name that is the board's label in other letters is that label.
    const same = board.labels?.find((l) => l.name.toLowerCase() === name.toLowerCase())?.name ?? name
    if (!names.includes(same)) onChange([...names, same])
    setDraft('')
    setOpen(false)
  }
  return (
    <div className="lbls" aria-label="Labels">
      {names.map((n) => <LabelChip key={n} name={n} color={colorOf(board.labels, n)} onRemove={() => onChange(names.filter((x) => x !== n))} />)}
      <span className="lbl-add">
        <button type="button" className="lbl lbl-plus" aria-expanded={open} onClick={() => setOpen((o) => !o)}>+ label</button>
        {open && (
          <div className="td-pop lbl-pop" role="menu">
            {free.map((l) => <button key={l.name} role="menuitem" onClick={() => add(l.name)}><LabelChip name={l.name} color={l.color} /></button>)}
            <input autoFocus value={draft} placeholder="New label" aria-label="New label" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(draft); else if (e.key === 'Escape') setOpen(false) }} />
          </div>
        )}
      </span>
    </div>
  )
}

/** The board's labels, managed: add one, rename it, give it another colour, or remove it from every task. */
export function LabelManager({ board, folder, act, confirm, onClose }: { board: TodoBoard; folder: string; act: (p: Promise<unknown>) => void; confirm: ReturnType<typeof useConfirm>[0]; onClose: () => void }) {
  const [draft, setDraft] = useState('')
  const [edit, setEdit] = useState<Record<string, string>>({})
  const uses = (n: string) => board.todos.filter((t) => t.labels?.includes(n)).length
  const rename = (from: string) => {
    const to = (edit[from] ?? from).trim()
    setEdit(({ [from]: _gone, ...rest }) => rest)
    if (to && to !== from) act(window.aw.todos.renameLabel(folder, from, to))
  }
  return (
    <div className="td-pop lbl-mgr" role="dialog" aria-label="Manage labels">
      <div className="lbl-mgr-h"><b>Labels</b><button className="td-x" onClick={onClose} aria-label="Close labels">×</button></div>
      {(board.labels ?? []).length === 0 && <p className="hint">No labels yet. Add one here, or from a task.</p>}
      {(board.labels ?? []).map((l) => (
        <div key={l.name} className="lbl-row">
          <span className="lbl-sw" role="radiogroup" aria-label={`Colour of ${l.name}`}>
            {LABEL_COLORS.map((c) => <button key={c} role="radio" aria-checked={l.color === c} aria-label={c} className="lbl-dot" data-c={c} onClick={() => act(window.aw.todos.recolorLabel(folder, l.name, c))} />)}
          </span>
          <input value={edit[l.name] ?? l.name} aria-label={`Name of ${l.name}`} onChange={(e) => setEdit((x) => ({ ...x, [l.name]: e.target.value }))} onBlur={() => rename(l.name)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
          <small>{uses(l.name)}</small>
          <button className="danger" aria-label={`Remove ${l.name}`} onClick={() => void confirm({ title: `Remove the label “${l.name}”?`, body: uses(l.name) ? `It is taken off ${uses(l.name)} task${uses(l.name) === 1 ? '' : 's'}. The tasks stay.` : 'No task has it.', confirm: 'Remove', danger: true }).then((yes) => yes && act(window.aw.todos.removeLabel(folder, l.name)))}>Remove</button>
        </div>
      ))}
      <input className="lbl-new" value={draft} placeholder="＋ New label" aria-label="New label name" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && draft.trim()) (act(window.aw.todos.addLabel(folder, draft.trim())), setDraft('')) }} />
    </div>
  )
}
