import type { SkillPlaces } from '../../shared/library'

/** Where one skill works: every Claude account in the app, and the other programs' skills folders. Each switch is one place; none of them copies the skill. */
export function SkillWhere({ id, places, onClaude, onLink, busy }: { id: string; places: SkillPlaces; onClaude: (on: boolean) => void; onLink: (target: string, on: boolean) => void; busy: boolean }) {
  const claude = !places.claudeOff.includes(id)
  const states = places.states[id] ?? {}
  return (
    <div className="lip-panel skw" role="tabpanel" aria-label="Where it works">
      <label className="skw-row">
        <span><b>Every Claude account in the app</b><small>Added to each Claude agent when it starts. Nothing is installed in an account folder.</small></span>
        <span className="wfl-sw"><input type="checkbox" role="switch" aria-label="On for every Claude account in the app" checked={claude} disabled={busy} onChange={(e) => onClaude(e.target.checked)} /><i className="wfl-track" aria-hidden /></span>
      </label>
      {places.targets.map((t) => {
        const st = states[t.id] ?? 'none'
        const note = st === 'copy' ? 'A copy with this name is there; it is left as it is.' : !t.present && st === 'none' ? 'Not installed on this computer.' : t.dir
        return (
          <label key={t.id} className="skw-row">
            <span><b>{t.label}</b><small title={t.dir}>{note}</small></span>
            {st === 'copy' ? <em className="skw-copy">a copy</em> : <span className="wfl-sw"><input type="checkbox" role="switch" aria-label={`Linked into ${t.label}`} checked={st === 'linked'} disabled={busy || (!t.present && st === 'none')} onChange={(e) => onLink(t.id, e.target.checked)} /><i className="wfl-track" aria-hidden /></span>}
          </label>
        )
      })}
      <p className="hint">A link points at the one copy in the library, so an edit shows everywhere. Agents already running keep the skills they started with until they restart.</p>
    </div>
  )
}
