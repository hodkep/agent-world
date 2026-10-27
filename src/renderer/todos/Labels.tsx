import { useEffect, useRef, useState } from 'react'
import { LABEL_PRESETS, isLabelColor, type Label, type TodoBoard } from '../../shared/todos'
import type { useConfirm } from '../panel/ConfirmDialog'
import { useDismiss } from '../useDismiss'

const DEFAULT = LABEL_PRESETS[0]!
const colorOf = (labels: Label[] | undefined, name: string) => labels?.find((l) => l.name === name)?.color ?? DEFAULT

/** A label as a small chip with its colour; with `onRemove` it can be taken off. */
export function LabelChip({ name, color, onRemove }: { name: string; color: string; onRemove?: () => void }) {
  return (
    <span className="lbl" style={{ '--c': color } as React.CSSProperties}>
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
  const wrap = useRef<HTMLSpanElement>(null)
  useDismiss(wrap, open, () => setOpen(false))
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
      <span className="lbl-add" ref={wrap}>
        <button type="button" className="lbl lbl-plus" aria-expanded={open} onClick={() => setOpen((o) => !o)}>+ label</button>
        {open && (
          <div className="td-pop lbl-pop" role="menu">
            {free.map((l) => <button key={l.name} role="menuitem" onClick={() => add(l.name)}><LabelChip name={l.name} color={l.color} /></button>)}
            <input autoFocus value={draft} placeholder="New label" aria-label="New label" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(draft) }} />
          </div>
        )}
      </span>
    </div>
  )
}

/** A colour for a label, as GitLab offers it: a grid of presets, and a field for any other #rrggbb. */
function ColorPicker({ name, color, onPick }: { name: string; color: string; onPick: (c: string) => void }) {
  const [open, setOpen] = useState(false)
  const [hex, setHex] = useState(color)
  const wrap = useRef<HTMLSpanElement>(null)
  useDismiss(wrap, open, () => setOpen(false))
  useEffect(() => setHex(color), [color])
  const pick = (c: string) => (onPick(c), setOpen(false))
  return (
    <span className="lbl-colour" ref={wrap}>
      <button className="lbl-swatch" style={{ '--c': color } as React.CSSProperties} aria-label={`Colour of ${name}`} aria-expanded={open} onClick={() => setOpen((o) => !o)} />
      {open && (
        <div className="td-pop lbl-grid" role="dialog" aria-label={`Colours for ${name}`}>
          <div className="lbl-presets" role="radiogroup" aria-label="Preset colours">
            {LABEL_PRESETS.map((c) => <button key={c} role="radio" aria-checked={c === color} aria-label={c} className="lbl-cell" style={{ '--c': c } as React.CSSProperties} onClick={() => pick(c)} />)}
          </div>
          <div className="lbl-hex">
            <i className="lbl-swatch" style={{ '--c': isLabelColor(hex) ? hex : color } as React.CSSProperties} aria-hidden="true" />
            <input value={hex} aria-label="Colour as #rrggbb" spellCheck={false} onChange={(e) => setHex(e.target.value.trim())} onKeyDown={(e) => { if (e.key === 'Enter' && isLabelColor(hex)) pick(hex.toLowerCase()) }} />
            <button disabled={!isLabelColor(hex)} onClick={() => pick(hex.toLowerCase())}>Set</button>
          </div>
        </div>
      )}
    </span>
  )
}

/** The Label button of the filter bar: pick a label to show only its tasks, or open the manager to add, rename, recolour and remove labels. */
export function LabelFilter({ board, folder, active, onPick, act, confirm }: { board: TodoBoard; folder: string; active?: string; onPick: (name: string | undefined) => void; act: (p: Promise<unknown>) => void; confirm: ReturnType<typeof useConfirm>[0] }) {
  const [open, setOpen] = useState(false)
  const [managing, setManaging] = useState(false)
  const wrap = useRef<HTMLSpanElement>(null)
  useDismiss(wrap, open, () => (setOpen(false), setManaging(false)))
  const labels = board.labels ?? []
  const uses = (n: string) => board.todos.filter((t) => t.labels?.includes(n)).length
  return (
    <span className="td-menu" ref={wrap}>
      <button className="td-chip" aria-pressed={!!active} aria-expanded={open} onClick={() => (setOpen((o) => !o), setManaging(false))}>
        {active ? <LabelChip name={active} color={colorOf(labels, active)} /> : 'Label'} ▾
      </button>
      {open && !managing && (
        <div className="td-pop lbl-pop lbl-filter-pop" role="menu" aria-label="Filter by label">
          <button role="menuitemradio" aria-checked={!active} onClick={() => (onPick(undefined), setOpen(false))}>Any label</button>
          {labels.map((l) => <button key={l.name} role="menuitemradio" aria-checked={active === l.name} onClick={() => (onPick(l.name), setOpen(false))}><LabelChip name={l.name} color={l.color} /><small>{uses(l.name)}</small></button>)}
          <button role="menuitem" className="lbl-manage" onClick={() => setManaging(true)}>Manage labels…</button>
        </div>
      )}
      {open && managing && <Manager board={board} folder={folder} act={act} confirm={confirm} onBack={() => setManaging(false)} />}
    </span>
  )
}

/** The board's labels, managed: add one, rename it, give it another colour, or remove it from every task. */
function Manager({ board, folder, act, confirm, onBack }: { board: TodoBoard; folder: string; act: (p: Promise<unknown>) => void; confirm: ReturnType<typeof useConfirm>[0]; onBack: () => void }) {
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
      <div className="lbl-mgr-h"><button className="td-link-btn" onClick={onBack}>← Labels</button><b>Manage labels</b></div>
      {(board.labels ?? []).length === 0 && <p className="hint">No labels yet. Add one here, or from a task.</p>}
      <div className="lbl-rows">
        {(board.labels ?? []).map((l) => (
          <div key={l.name} className="lbl-row">
            <ColorPicker name={l.name} color={l.color} onPick={(c) => act(window.aw.todos.recolorLabel(folder, l.name, c))} />
            <input value={edit[l.name] ?? l.name} aria-label={`Name of ${l.name}`} onChange={(e) => setEdit((x) => ({ ...x, [l.name]: e.target.value }))} onBlur={() => rename(l.name)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
            <small title="Tasks with it">{uses(l.name)}</small>
            <button className="danger" aria-label={`Remove ${l.name}`} onClick={() => void confirm({ title: `Remove the label “${l.name}”?`, body: uses(l.name) ? `It is taken off ${uses(l.name)} task${uses(l.name) === 1 ? '' : 's'}. The tasks stay.` : 'No task has it.', confirm: 'Remove', danger: true }).then((yes) => yes && act(window.aw.todos.removeLabel(folder, l.name)))}>Remove</button>
          </div>
        ))}
      </div>
      <input className="lbl-new" value={draft} placeholder="＋ New label" aria-label="New label name" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && draft.trim()) (act(window.aw.todos.addLabel(folder, draft.trim())), setDraft('')) }} />
    </div>
  )
}
