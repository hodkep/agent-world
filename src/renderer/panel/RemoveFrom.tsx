import { useEffect, useRef, useState } from 'react'
import { clean } from './McpBits'
import { OutlineIcon, type HeaderIconName } from './IconButton'

export interface RemoveLine {
  text: string
  note?: string
}
export interface RemoveOption {
  key: string
  label: string
  /** What it does, in a line under the label. */
  hint?: string
  icon?: HeaderIconName
  /** keep: the one that is usually wanted; danger: takes real data away. */
  tone?: 'keep' | 'danger'
}

/** One action as a row of the reader: an icon in a box, its name, and a line on what it does; the same row for the removals and for what a skill's footer used to hold. */
export function ActionRow({ icon, label, hint, tone, disabled, onClick }: { icon: HeaderIconName; label: string; hint?: string; tone?: RemoveOption['tone']; disabled?: boolean; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void }) {
  return (
    <button type="button" className={`mt-opt${tone ? ` mt-${tone}` : ''}`} disabled={disabled} onClick={onClick}>
      <span className="mt-opt-ic"><OutlineIcon name={icon} size={16} /></span>
      <span className="mt-opt-t"><b>{label}</b>{hint && <small>{hint}</small>}</span>
    </button>
  )
}
/** What one removal would do, made by the main process: the lines to show, the folders that stay, and the call that does exactly that. */
export interface RemovePlan {
  lines: RemoveLine[]
  left?: string[]
  commit: () => Promise<unknown>
}

/**
 * A row of "Remove from…" buttons. Pressing one asks the main process what it would change and shows that list, and nothing is changed until Remove is pressed: the call is made only
 * if the files still hold what was shown. Used for an MCP server's places and for a skill's links.
 */
export function RemoveFrom({ name, options, plan, onDone, inline }: { name: string; options: RemoveOption[]; plan: (key: string) => Promise<RemovePlan>; onDone: () => void; /** One small button with an icon, for a card, instead of the rows of a reader. */ inline?: boolean }) {
  const [ask, setAsk] = useState<RemovePlan | null>(null)
  const [fail, setFail] = useState('')
  const [busy, setBusy] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  // The question opens inside a scrolling reader: bring it into view so the buttons are never hidden under the footer.
  useEffect(() => void box.current?.scrollIntoView?.({ block: 'nearest' }), [ask])
  const open = (key: string) => {
    setFail('')
    setBusy(true)
    return plan(key).then(setAsk, (e: unknown) => (setAsk(null), setFail(clean(e)))).finally(() => setBusy(false))
  }
  const go = () => {
    if (!ask) return
    setBusy(true)
    return ask.commit().then(() => (setAsk(null), setFail(''), onDone()), (e: unknown) => setFail(clean(e))).finally(() => setBusy(false))
  }
  return (
    <div className="mt-rm">
      {inline ? (
        <div className="mt-rm-row">
          {options.map((o) => <button key={o.key} className="ghost sm mt-opt-inline" disabled={busy} onClick={() => void open(o.key)}><OutlineIcon name={o.icon ?? 'trash'} size={14} />{o.label}</button>)}
        </div>
      ) : (
        <div className="mt-opts">
          {options.map((o) => <ActionRow key={o.key} icon={o.icon ?? 'trash'} label={o.label} hint={o.hint} tone={o.tone} disabled={busy} onClick={() => void open(o.key)} />)}
        </div>
      )}
      {!ask && fail && <p className="error" role="alert">{fail}</p>}
      {ask && (
        <div ref={box} className="sk2-note mt-ask" role="alertdialog" aria-label={`Remove ${name}?`}>
          <div className="mt-ask-body">
            <b>Remove {name} from these?</b>
            <ul className="mt-rm-list">
              {ask.lines.map((l, i) => <li key={i}><span className="mono">{l.text}</span>{l.note && <small>{l.note}</small>}</li>)}
            </ul>
            {ask.left && ask.left.length > 0 && <p className="hint">Left as they are, because something else of that name is there: <span className="mono">{ask.left.join(', ')}</span></p>}
            {fail && <p className="error" role="alert">{fail}</p>}
          </div>
          <button className="danger" disabled={busy} onClick={() => void go()}>Remove</button>
          <button disabled={busy} onClick={() => (setAsk(null), setFail(''))}>Cancel</button>
        </div>
      )}
    </div>
  )
}
