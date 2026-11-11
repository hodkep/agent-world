import { Callout } from './Callout'
import { useState, type ReactNode } from 'react'
import type { DeletePlan, LibraryCandidate, LibraryItem, SkillPlaces, SkillUse } from '../../shared/library'
import { sizeText } from '../../shared/size'
import { shortPath } from './skillGroups'
import { toast } from '../toasts'

/** The skill's reader, as one calm column: where it lives, where it works, and where it is used. */
export function SkillOverview({ item, use, places, where, original, busy, onUseOriginal }: { item: LibraryItem; use?: SkillUse; places: SkillPlaces; where: ReactNode; original?: string; busy: boolean; onUseOriginal: (dir: string, at: DOMRect) => void }) {
  const p = item.place
  const projects = Object.entries(use?.projects ?? {}).sort((a, b) => b[1] - a[1])
  const top = projects[0]?.[1] ?? 1
  const nameOf = (key: string) => places.projects.find((x) => x.key === key)?.name ?? key
  const act = (v: Promise<unknown>) => void v.catch(toast)
  return (
    <div className="sk2-over">
      <section>
        <h5>Where it lives</h5>
        <dl className="sk2-kv">
          <div>
            <dt>Folder</dt>
            <dd><span className="mono" title={p?.real ?? item.dir}>{item.missing ? `${p?.real} (gone)` : p ? p.real : 'Kept in the library itself'}</span>{item.size && <span className="sk2-chip">{sizeText(item.size.bytes)}</span>}</dd>
            <span className="sk2-kvact">
              {!item.missing && <button className="ghost sm" onClick={() => act(navigator.clipboard.writeText(p?.real ?? item.dir))}>Copy</button>}
              {!item.missing && <button className="ghost sm" onClick={() => act(window.aw.library.file(item.id, null, 'show'))}>Show in Finder</button>}
            </span>
          </div>
          {p?.from && <div><dt>From</dt><dd className="mono">{p.from}{p.license ? ` · ${p.license}` : ''}</dd></div>}
          {p?.kind === 'project' && p.project && <div><dt>Project</dt><dd className="mono" title={p.project}>{shortPath(p.project)}</dd></div>}
          {p?.accounts && p.accounts.length > 0 && <div><dt>Accounts</dt><dd>{p.accounts.join(' · ')}</dd></div>}
        </dl>
        {original && (
          <div className="sk2-note" role="note">
            <span>The original is still there. A link to it costs nothing and frees {item.size ? sizeText(item.size.bytes) : 'the copy'}. If this copy differs from it, you see how before anything is deleted.</span>
            <button disabled={busy} onClick={(e) => onUseOriginal(original, e.currentTarget.getBoundingClientRect())}>Use the original, delete the copy</button>
          </div>
        )}
      </section>
      {!item.missing && <section><h5>Where it works</h5>{where}</section>}
      <section>
        <h5>Used in 30 days</h5>
        {projects.length === 0 ? <p className="hint">Not used in the last 30 days.</p> : (
          <div className="sk2-used">
            {projects.map(([key, n]) => (
              <div key={key} className="sk2-u"><span title={key}>{nameOf(key)}</span><i style={{ width: `${Math.max(6, Math.round((n / top) * 100))}%` }} aria-hidden /><b>{n}×</b></div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

/** Remove drops the library's link and keeps the files; Delete says what it would remove and what that frees, and asks once (twice for a project skill that git tracks). */
export function SkillFooter({ item, busy, onRemove, onDeleted }: { item: LibraryItem; busy: boolean; onRemove: (at: DOMRect) => void; onDeleted: () => void }) {
  const [plan, setPlan] = useState<DeletePlan | null>(null)
  // The button the question is asked from: the callout points at it.
  const [at, setAt] = useState<DOMRect | null>(null)
  const [again, setAgain] = useState(false)
  const ask = (e: React.MouseEvent<HTMLButtonElement>) => {
    setAt(e.currentTarget.getBoundingClientRect())
    // A refused plan is told in a toast: the question never opens for it.
    window.aw.library.deletePlan(item.id).then((p) => (p.refused ? toast(p.refused) : setPlan(p)), toast)
  }
  const go = (anyway: boolean) => window.aw.library.delete(item.id, anyway).then(onDeleted, (e) => (toast(e), close()))
  const copy = !item.place
  const total = plan?.files.reduce((n, f) => n + (f.bytes ?? 0), 0) ?? 0
  const asking = plan && !plan.refused && (plan.files.length || plan.links.length) && at
  const close = () => (setPlan(null), setAgain(false))
  return (
    <div className="sk2-foot">
      <button className="ghost" disabled={busy} onClick={(e) => onRemove(e.currentTarget.getBoundingClientRect())}>{copy ? 'Delete from the library' : 'Remove from library'}</button>
      {!copy && !item.missing && item.place?.kind !== 'plugin' && <button className="ghost bad-text" disabled={busy} onClick={ask}>Delete…</button>}
      <span className="lib-sp" />
      <span className="hint">{copy ? 'The files are kept in the library, so this deletes them.' : item.missing ? 'Its folder is gone, so there is nothing left to delete.' : item.place?.kind === 'plugin' ? 'Claude manages this skill: it can only be removed.' : 'Remove keeps the files. Delete removes them.'}</span>
      {asking && plan && (
        <Callout at={at} tone="ask" label={`Delete ${item.name}`} onClose={close}>
          <b>Delete {item.name}?</b>
          <p>This removes its files and the links that lead to it. It cannot be undone.</p>
          <ul className="callout-list">
            {plan.files.map((f) => <li key={f.path}>{f.path}{f.bytes !== undefined ? `  (${sizeText(f.bytes)})` : ''}</li>)}
            {plan.links.map((l) => <li key={l}>{l}  (a link)</li>)}
            <li>the library's link</li>
          </ul>
          <p className="hint">It will disappear from Claude Code, Antigravity{plan.rules ? ` and ${plan.rules} playbook ${plan.rules === 1 ? 'rule' : 'rules'} that name it` : ''}.</p>
          {plan.tracked && !again && <p className="warn"><b>Git tracks this skill</b> in its project: deleting it shows as a deletion there.</p>}
          <div className="su-row">
            {plan.tracked && !again ? <button className="danger sm" disabled={busy} onClick={() => setAgain(true)}>Delete anyway…</button> : <button className="danger sm" disabled={busy} onClick={() => void go(plan.tracked)}>{total ? `Delete ${sizeText(total)}` : 'Delete'}</button>}
            <button className="sm" onClick={close}>Keep it</button>
            <button className="ghost sm" onClick={() => (close(), onRemove(at))}>Remove from library only</button>
          </div>
        </Callout>
      )}
    </div>
  )
}

/** A skill found on this computer that is not in the library yet: where it lives, and one button to add a link to it. */
export function FoundReader({ c, busy, onAdd }: { c: LibraryCandidate; busy: boolean; onAdd: () => void }) {
  return (
    <div className="lip sk2-reader" role="group" aria-label={`${c.name} found on this computer`}>
      <div className="lip-top">
        <div className="lip-title"><h3>{c.name}</h3><small className="lib-kind">found</small></div>
        <p className="lip-desc">{c.description}</p>
      </div>
      <div className="sk2-over">
        <section>
          <h5>Where it lives</h5>
          <dl className="sk2-kv">
            <div><dt>Folder</dt><dd className="mono" title={c.real}>{c.real}</dd></div>
            {c.from && <div><dt>From</dt><dd className="mono">{c.from}{c.license ? ` · ${c.license}` : ''}</dd></div>}
            {c.project && <div><dt>Project</dt><dd className="mono" title={c.project}>{shortPath(c.project)}</dd></div>}
            {c.accounts && c.accounts.length > 0 && <div><dt>Accounts</dt><dd>{c.accounts.join(' · ')}</dd></div>}
          </dl>
        </section>
      </div>
      <div className="sk2-foot">
        <button className="primary" disabled={busy} onClick={onAdd}>Add to library</button>
        <span className="lib-sp" />
        <span className="hint">Adds a link. Nothing is copied, and nothing is written into the folder.</span>
      </div>
    </div>
  )
}
