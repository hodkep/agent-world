import { useEffect, useState } from 'react'
import { type Identity, type IdentityState, type Profile, pickProfile, profileUse, removeProfile, saveProfile } from '../../shared/identity'

/** The identity and the logins gh holds, kept in step with what is saved. */
function useIdentity() {
  const [s, setS] = useState<IdentityState | null>(null)
  useEffect(() => void window.aw.identity.state().then(setS, () => undefined), [])
  const save = async (identity: Identity) => setS(await window.aw.identity.save(identity))
  return { s, save }
}

/** The project's own pane: which profile its agents and terminals act as. */
export function ProjectIdentity({ project }: { project: { path: string; name: string } }) {
  const { s, save } = useIdentity()
  const picked = s?.identity.byProject[project.path] ?? ''
  const profile = s?.identity.profiles.find((p) => p.id === picked)
  const signedIn = (login: string) => !!s?.logins.some((l) => l.login === login)
  const pick = (id: string) => s && void save(pickProfile(s.identity, project.path, id))
  return (
    <>
      <legend>GitHub identity</legend>
      <p className="set-lead">Who agents and terminals in <b>{project.name}</b> act as. Applies only to this project, to agents hired and terminals opened from now on.</p>
      {s && (
        <>
          <div className="hire-pick" role="radiogroup" aria-label="Profile">
            <label className="hire-opt" data-on={picked === ''}>
              <input type="radio" name="project-profile" checked={picked === ''} onChange={() => pick('')} />
              <b>Use current</b>
              <span className="hint">Whatever gh and git are set to on this machine</span>
            </label>
            {s.identity.profiles.map((p) => (
              <label key={p.id} className="hire-opt" data-on={picked === p.id}>
                <input type="radio" name="project-profile" checked={picked === p.id} onChange={() => pick(p.id)} />
                <b>{p.name} <small className={signedIn(p.login) ? 'ok-text' : 'warn-text'}>{p.login}{signedIn(p.login) ? '' : ' · signed out'}</small></b>
                <span className="hint">{p.gitName} · {p.gitEmail}</span>
              </label>
            ))}
          </div>
          {s.identity.profiles.length === 0 && <p className="set-lead">No profiles yet. Make one under App, GitHub profiles.</p>}
          {profile && !signedIn(profile.login) && (
            <div className="set-warn" role="alert">
              <span><b>{profile.login}</b> is not signed in to gh on this machine, so agents here cannot push as it. Run <code>gh auth login</code> in a terminal tab, then check again.</span>
              <button onClick={() => void save(s.identity)}>Check sign-in</button>
            </div>
          )}
        </>
      )}
    </>
  )
}

const blank = { name: '', login: '', gitName: '', gitEmail: '' }

/** The profiles themselves: a login plus the name and email on commits. */
export function GitHubProfiles() {
  const { s, save } = useIdentity()
  const [edit, setEdit] = useState<(Omit<Profile, 'id'> & { id?: string }) | null>(null)
  const field = (key: keyof typeof blank, label: string) => (
    <label>
      <span className="lab">{label}</span>
      <input aria-label={label} value={edit![key]} onChange={(e) => setEdit({ ...edit!, [key]: e.target.value })} />
    </label>
  )
  const valid = !!edit && !!edit.name.trim() && !!edit.login && !!edit.gitName.trim() && edit.gitEmail.includes('@')
  const done = async (next: Identity) => (await save(next), setEdit(null))
  return (
    <>
      <legend>GitHub profiles</legend>
      <p className="set-lead">A profile is a login plus the name and email on commits. Two profiles can share a login, one email per team. Pick one for each project under This project.</p>
      {s && !edit && (
        <>
          <div className="hire-pick">
            {s.identity.profiles.map((p) => {
              const n = profileUse(s.identity, p.id).length
              return (
                <button key={p.id} className="hire-opt" data-profile={p.id} onClick={() => setEdit(p)}>
                  <b>{p.name} <small>{p.login}</small></b>
                  <span className="hint">{p.gitName} · {p.gitEmail} · used by {n} {n === 1 ? 'project' : 'projects'}</span>
                </button>
              )
            })}
          </div>
          <div><button onClick={() => setEdit({ ...blank, login: s.logins.find((l) => l.active)?.login ?? '' })}>New profile</button></div>
        </>
      )}
      {s && edit && (
        <div className="set-card">
          {field('name', 'Profile name')}
          <label>
            <span className="lab">GitHub login</span>
            <select aria-label="GitHub login" value={edit.login} onChange={(e) => setEdit({ ...edit, login: e.target.value })}>
              {edit.login && !s.logins.some((l) => l.login === edit.login) && <option value={edit.login}>{edit.login} (signed out)</option>}
              {s.logins.map((l) => <option key={l.login} value={l.login}>{l.login}</option>)}
            </select>
          </label>
          {field('gitName', 'Commit name')}
          {field('gitEmail', 'Commit email')}
          <p className="set-lead">An account that keeps its email private needs its <code>noreply</code> address here, or GitHub refuses the push.</p>
          <div className="set-row">
            <button className="primary" disabled={!valid} onClick={() => void done(saveProfile(s.identity, edit))}>Save profile</button>
            <button onClick={() => setEdit(null)}>Cancel</button>
            {edit.id && <button className="danger" onClick={() => void done(removeProfile(s.identity, edit.id!))}>Delete</button>}
          </div>
        </div>
      )}
    </>
  )
}
