import { useState, type CSSProperties } from 'react'
import type { LookVersion } from '../../shared/chatMod'
import { SWATCH_DEFAULT, type Swatch } from '../../shared/lookSwatch'
import { useChatModState } from '../chat/layoutUi'
import { OutlineIcon } from './IconButton'

type Pick = number | 'system'

/** A small picture of a look, drawn from the colours its own CSS sets. */
function Thumb({ swatch, big }: { swatch: Swatch; big?: boolean }) {
  const style = { '--lk-bg': swatch.bg, '--lk-panel': swatch.panel, '--lk-accent': swatch.accent, '--lk-paper': swatch.paper } as CSSProperties
  return <span className={big ? 'lk-thumb big' : 'lk-thumb'} style={style} aria-hidden="true" />
}

const label = (v: LookVersion) => v.name || `v${v.n}`
const when = (at: number) => (at ? new Date(at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'before versions were numbered')

/** Settings, Looks: every look that was kept, to compare and switch back to at any time. */
export function LooksPane() {
  const s = useChatModState()
  const live = s.versions.find((v) => v.active)
  const [picked, setPicked] = useState<Pick | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [note, setNote] = useState<{ text: string; undo: Pick } | null>(null)
  // What is shown on the right: the one clicked if it is still there, else the newest that is not in force.
  const chosen: Pick = picked === 'system' || s.versions.some((v) => v.n === picked) ? (picked as Pick) : (s.versions.find((v) => !v.active)?.n ?? 'system')
  const sel = chosen === 'system' ? undefined : s.versions.find((v) => v.n === chosen)
  const inForce = chosen === 'system' ? !live : !!sel?.active
  const pick = (p: Pick) => (setPicked(p), setRenaming(null), setConfirming(false))
  const leaving: Pick = live ? live.n : 'system'
  const switchTo = async (to: Pick) => {
    const left = leaving
    const from = live ? label(live) : 'The system look'
    if (await window.aw.chatModSwitch(to)) setNote({ text: `Switched to ${to === 'system' ? 'the system look' : label(s.versions.find((v) => v.n === to)!)}. ${from} is saved.`, undo: left })
  }
  const save = (v: LookVersion, name: string) => (setRenaming(null), void window.aw.chatModRename(v.n, name))

  return (
    <>
      <legend>Looks</legend>
      <p className="set-lead">Every look you keep is saved here under a number. Pick one to compare it with the look in force, and switch back to it any time: the look you leave is saved first.</p>
      {s.draft && <p className="lk-draft">A new look from {s.draftBy ?? 'an agent'} is waiting for Keep or Undo. Switching drops it.</p>}
      <div className="lk">
        <div className="lk-tl" role="listbox" aria-label="Kept looks">
          <button role="option" aria-selected={chosen === 'system'} className="lk-row" data-active={!live} data-sel={chosen === 'system'} onClick={() => pick('system')}>
            <Thumb swatch={SWATCH_DEFAULT} />
            <span className="t">
              <b>System look</b>
              <small>No agent changes</small>
            </span>
            {!live && <span className="lk-badge">in force</span>}
          </button>
          {s.versions.map((v) => (
            <button key={v.n} role="option" aria-selected={chosen === v.n} className="lk-row" data-active={v.active} data-sel={chosen === v.n} onClick={() => pick(v.n)}>
              <Thumb swatch={v.swatch} />
              <span className="t">
                <b>
                  {label(v)}
                  {v.name && <em>v{v.n}</em>}
                </b>
                <small>{v.by ? `${v.by} · ` : ''}{v.why || when(v.at)}</small>
              </span>
              {v.active && <span className="lk-badge">in force</span>}
            </button>
          ))}
        </div>
        <div className="lk-det">
          <div className="lk-cmp">
            <figure>
              <figcaption>In force · {live ? label(live) : 'system'}</figcaption>
              <Thumb swatch={live?.swatch ?? SWATCH_DEFAULT} big />
            </figure>
            <figure>
              <figcaption>Selected · {sel ? label(sel) : 'system'}</figcaption>
              <Thumb swatch={sel?.swatch ?? SWATCH_DEFAULT} big />
            </figure>
          </div>
          {sel ? (
            <>
              {renaming !== null ? (
                <form className="lk-name" onSubmit={(e) => (e.preventDefault(), save(sel, renaming))}>
                  <input autoFocus aria-label={`Name for v${sel.n}`} maxLength={40} value={renaming} placeholder={`v${sel.n}`} onChange={(e) => setRenaming(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setRenaming(null))} />
                  <button type="submit">Save</button>
                  <button type="button" onClick={() => setRenaming(null)}>
                    Cancel
                  </button>
                </form>
              ) : (
                <dl className="lk-facts">
                  <dt>Version</dt>
                  <dd>
                    v{sel.n}
                    {sel.name && ` · ${sel.name}`}
                  </dd>
                  <dt>Written by</dt>
                  <dd>{sel.by || 'not recorded'} · {when(sel.at)}</dd>
                  {sel.why && (
                    <>
                      <dt>Why</dt>
                      <dd>{sel.why}</dd>
                    </>
                  )}
                  <dt>Changes</dt>
                  <dd className="lk-chips">
                    <span>CSS {sel.cssBytes < 1000 ? `${sel.cssBytes} B` : `${(sel.cssBytes / 1000).toFixed(1)} kB`}</span>
                    <span>{sel.rules} layout {sel.rules === 1 ? 'rule' : 'rules'}</span>
                    <span>{sel.widgets} {sel.widgets === 1 ? 'widget' : 'widgets'}</span>
                  </dd>
                </dl>
              )}
            </>
          ) : (
            <p className="set-lead">The app as it comes: no colours, layout rules or widgets from an agent.</p>
          )}
          <div className="lk-acts">
            {sel && !sel.active && (confirming ? (
              <>
                <span className="lk-ask">Delete {label(sel)} for good?</span>
                <button className="danger" onClick={() => (setConfirming(false), void window.aw.chatModRemove(sel.n))}>
                  Delete
                </button>
                <button onClick={() => setConfirming(false)}>Keep it</button>
              </>
            ) : (
              <button className="danger" onClick={() => setConfirming(true)}>
                <OutlineIcon name="trash" size={14} /> Delete
              </button>
            ))}
            {sel && renaming === null && !confirming && (
              <button onClick={() => setRenaming(sel.name)}>
                <OutlineIcon name="pencil" size={14} /> Rename
              </button>
            )}
            <span className="lk-sp" />
            {!confirming && <button className="primary" disabled={inForce} onClick={() => void switchTo(chosen)}>
              <OutlineIcon name="tick" size={14} /> {inForce ? 'In force' : `Switch to ${sel ? label(sel) : 'system look'}`}
            </button>}
          </div>
        </div>
      </div>
      {note && (
        <p className="lk-note" role="status">
          {note.text}
          <button onClick={() => (setNote(null), void window.aw.chatModSwitch(note.undo))}>Undo</button>
        </p>
      )}
    </>
  )
}
