import { useState, type ReactNode } from 'react'
import type { DeletePlan, LibraryCandidate, LibraryItem, SkillPlaces, SkillUse } from '../../shared/library'
import { sizeText } from '../../shared/size'
import { shortPath } from './skillGroups'

/** The skill's reader, as one calm column: where it lives, where it works, and where it is used. */
export function SkillOverview({ item, use, places, where, original, busy, onUseOriginal }: { item: LibraryItem; use?: SkillUse; places: SkillPlaces; where: ReactNode; original?: string; busy: boolean; onUseOriginal: (dir: string) => void }) {
  const p = item.place
  const projects = Object.entries(use?.projects ?? {}).sort((a, b) => b[1] - a[1])
  const top = projects[0]?.[1] ?? 1
  const nameOf = (key: string) => places.projects.find((x) => x.key === key)?.name ?? key
  const [fail, setFail] = useState('')
  const act = (v: Promise<unknown>) => void v.then(() => setFail(''), (e: unknown) => setFail(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e)))
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
            <span>The original is still there, and has every file of this copy. A link to it costs nothing and frees {item.size ? sizeText(item.size.bytes) : 'the copy'}.</span>
            <button disabled={busy} onClick={() => onUseOriginal(original)}>Use the original, delete the copy</button>
          </div>
        )}
        {fail && <p className="error" role="alert">{fail}</p>}
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
export function SkillFooter({ item, busy, onRemove, onDeleted }: { item: LibraryItem; busy: boolean; onRemove: () => void; onDeleted: () => void }) {
  const [plan, setPlan] = useState<DeletePlan | null>(null)
  const [again, setAgain] = useState(false)
  const [error, setError] = useState('')
  const clean = (e: unknown) => (e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))
  const ask = () => {
    setError('')
    window.aw.library.deletePlan(item.id).then(setPlan, (e) => setError(clean(e)))
  }
  const go = (anyway: boolean) => window.aw.library.delete(item.id, anyway).then(onDeleted, (e) => setError(clean(e)))
  const copy = !item.place
  const total = plan?.files.reduce((n, f) => n + (f.bytes ?? 0), 0) ?? 0
  if (plan && !plan.refused && (plan.files.length || plan.links.length)) {
    return (
      <div className="sk2-foot confirm" role="alertdialog" aria-label={`Delete ${item.name}`}>
        <p><b>Delete {item.name}?</b> This removes its files and the links that lead to it. It cannot be undone.</p>
        <ul>
          {plan.files.map((f) => <li key={f.path}>{f.path}{f.bytes !== undefined ? `  (${sizeText(f.bytes)})` : ''}</li>)}
          {plan.links.map((l) => <li key={l}>{l}  (a link)</li>)}
          <li>the library's link</li>
        </ul>
        <p className="hint">It will disappear from Claude Code, Antigravity{plan.rules ? ` and ${plan.rules} playbook ${plan.rules === 1 ? 'rule' : 'rules'} that name it` : ''}.</p>
        {plan.tracked && !again && <p className="warn"><b>Git tracks this skill</b> in its project: deleting it shows as a deletion there.</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="sk2-acts">
          {plan.tracked && !again ? <button className="danger" disabled={busy} onClick={() => setAgain(true)}>Delete anyway…</button> : <button className="danger" disabled={busy} onClick={() => void go(plan.tracked)}>{total ? `Delete ${sizeText(total)}` : 'Delete'}</button>}
          <button onClick={() => (setPlan(null), setAgain(false))}>Keep it</button>
          <button className="ghost" onClick={onRemove}>Remove from library only</button>
        </div>
      </div>
    )
  }
  return (
    <div className="sk2-foot">
      <button className="ghost" disabled={busy} onClick={onRemove}>{copy ? 'Delete from the library' : 'Remove from library'}</button>
      {!copy && !item.missing && item.place?.kind !== 'plugin' && <button className="ghost bad-text" disabled={busy} onClick={ask}>Delete…</button>}
      <span className="lib-sp" />
      <span className="hint">{copy ? 'The files are kept in the library, so this deletes them.' : item.missing ? 'Its folder is gone, so there is nothing left to delete.' : item.place?.kind === 'plugin' ? 'Claude manages this skill: it can only be removed.' : 'Remove keeps the files. Delete removes them.'}</span>
      {(plan?.refused || error) && <p className="error" role="alert">{plan?.refused ?? error}</p>}
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
