import { useEffect, useState } from 'react'
import type { SkillPlaces } from '../../shared/library'

type Stage =
  | { k: 'ask' }
  | { k: 'look' }
  | { k: 'pick'; skills: { name: string; description: string }[] }
  | { k: 'run' }
  | { k: 'done'; names: string[]; added: string[] }

const clean = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']*': (Error: )?/, '')

/**
 * Installs skills with the skills CLI: look inside a GitHub repository, tick the skills, install. They land in the CLI's own store
 * (~/.agents/skills) and are added to the library as links. Plain Claude Code does not read that store, so it says so and offers the link.
 */
export function SkillInstall({ places, onClose, onInstalled, onLinkClaude }: { places: SkillPlaces | null; onClose: () => void; onInstalled: () => Promise<void>; onLinkClaude: (ids: string[]) => Promise<void> }) {
  const [stage, setStage] = useState<Stage>({ k: 'ask' })
  const [pkg, setPkg] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [log, setLog] = useState<string[]>([])
  const [error, setError] = useState('')
  const [listed, setListed] = useState<{ name: string; description: string }[]>([])
  useEffect(() => window.aw.onLibraryInstallLog((l) => setLog((p) => [...p.slice(-80), l])), [])

  const look = async () => {
    setError('')
    setStage({ k: 'look' })
    try {
      const skills = await window.aw.library.installList(pkg.trim())
      setPicked(new Set())
      setListed(skills)
      setStage(skills.length ? { k: 'pick', skills } : { k: 'ask' })
      if (!skills.length) setError('That repository holds no skills.')
    } catch (e) {
      setStage({ k: 'ask' })
      setError(clean(e))
    }
  }
  const install = async () => {
    setError('')
    setLog([])
    setStage({ k: 'run' })
    try {
      const r = await window.aw.library.install(pkg.trim(), [...picked])
      await onInstalled()
      setStage({ k: 'done', names: r.names, added: r.added })
    } catch (e) {
      setStage({ k: 'pick', skills: listed })
      setError(clean(e))
    }
  }
  const unseen = stage.k === 'done' ? stage.added.filter((id) => (places?.states[id]?.claude ?? 'none') === 'none') : []

  return (
    <div className="sk2-drawer" role="group" aria-label="Install skills">
      <div className="sk2-dh"><b>{stage.k === 'done' ? `Installed ${stage.names.join(', ')}` : 'Install skills'}</b><button className="ghost" onClick={onClose}>Close</button></div>
      <div className="sk2-db">
        {error && <p className="sk2-err" role="alert">{error}</p>}
        {(stage.k === 'ask' || stage.k === 'look') && (
          <>
            <label className="sk2-lbl">A GitHub repository or a link
              <input autoFocus value={pkg} placeholder="owner/repo" disabled={stage.k === 'look'} onChange={(e) => setPkg(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && pkg.trim() && void look()} />
            </label>
            <p className="sk2-warn" role="note"><b>Installs through the skills CLI</b> (an npm package, run with npx), which reports installs to its maker. Skills land in <span className="mono">~/.agents/skills</span>.</p>
            <div className="sk2-acts"><button className="primary" disabled={!pkg.trim() || stage.k === 'look'} onClick={() => void look()}>{stage.k === 'look' ? 'Looking…' : 'Look inside'}</button></div>
          </>
        )}
        {stage.k === 'pick' && (
          <>
            <div className="sk2-picks">
              {stage.skills.map((s) => (
                <label key={s.name} className="sk2-pick">
                  <input type="checkbox" checked={picked.has(s.name)} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(s.name); else n.delete(s.name); return n })} />
                  <span><b>{s.name}</b><small>{s.description}</small></span>
                </label>
              ))}
            </div>
            <div className="sk2-acts">
              <button className="primary" disabled={picked.size === 0} onClick={() => void install()}>Install {picked.size} {picked.size === 1 ? 'skill' : 'skills'}</button>
              <button className="ghost" onClick={() => setStage({ k: 'ask' })}>Back</button>
            </div>
          </>
        )}
        {stage.k === 'run' && <pre className="sk2-log" role="log" aria-live="polite">{log.length ? log.join('\n') : 'Starting the skills CLI…'}</pre>}
        {stage.k === 'done' && (
          <>
            <p className="hint">Added to the library as {stage.added.length === 1 ? 'a link' : 'links'}. Agents started from this app get {stage.added.length === 1 ? 'it' : 'them'} when {stage.added.length === 1 ? 'it is' : 'they are'} on for Claude.</p>
            {unseen.length > 0 && (
              <div className="sk2-warn" role="note">
                <b>Plain Claude Code does not see {unseen.length === 1 ? 'it' : 'them'} yet.</b> {unseen.length === 1 ? 'It is' : 'They are'} in <span className="mono">~/.agents/skills</span>, which Claude Code does not read. Antigravity does.
                <div className="sk2-acts"><button onClick={() => void onLinkClaude(unseen)}>Link into ~/.claude/skills</button></div>
              </div>
            )}
            <div className="sk2-acts"><button onClick={onClose}>Done</button></div>
          </>
        )}
      </div>
    </div>
  )
}
