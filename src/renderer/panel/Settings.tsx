import { useEffect, useRef, useState } from 'react'
import type { Role } from '../../shared/roles'
import type { Prefs, ProviderInfo } from '../../shared/types'
import { MailConnect } from './MailConnect'
import { MODELS } from './HireForm'
import { closeOnBackdrop } from './Modal'

const PERMISSIONS = [
  { value: '', label: "Claude's default" },
  { value: 'manual', label: 'Ask for everything' },
  { value: 'acceptEdits', label: 'Accept edits' },
  { value: 'plan', label: 'Plan first' }
]

/** Preferences that outlive a session. Each change is saved as it is made. */
export function Settings({ prefs, roles, onChange, onClose, onSetup, providers, onProviders }: { prefs: Prefs; roles: Role[]; onChange: (patch: Partial<Prefs>) => void; onClose: () => void; onSetup: () => void; providers: ProviderInfo[]; onProviders: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [path, setPath] = useState(prefs.providers.claude?.path ?? '')
  const [rules, setRules] = useState(prefs.houseRules)
  const [url, setUrl] = useState(prefs.updateUrl)
  const [update, setUpdate] = useState('')
  useEffect(() => window.aw.onUpdateState((s) => s.detail && setUpdate(s.detail)), [])
  useEffect(() => dialog.current?.showModal(), [])
  const set = (patch: Partial<Prefs>) => onChange(patch)
  const setRoleModel = (title: string, model: string) => {
    const { [title]: _, ...rest } = prefs.roleModels
    set({ roleModels: model ? { ...rest, [title]: model } : rest })
  }
  const setDefaults = (patch: Partial<Prefs['defaults']>) => set({ defaults: { ...prefs.defaults, ...patch } })
  return (
    <dialog ref={dialog} className="settings" aria-label="Settings" onClose={onClose} onCancel={onClose} {...closeOnBackdrop(onClose)}>
      <header className="settings-head">
        <b>Settings</b>
        <button onClick={onClose} aria-label="Close settings">
          Close
        </button>
      </header>
      <fieldset>
        <legend>Alerts</legend>
        <label>
          Notifications
          <select value={prefs.notifications} onChange={(e) => set({ notifications: e.target.value as Prefs['notifications'] })}>
            <option value="all">When an agent needs me or finishes</option>
            <option value="attention">Only when an agent needs me</option>
            <option value="off">Never</option>
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={prefs.keepAwake} onChange={(e) => set({ keepAwake: e.target.checked })} /> Keep the computer awake while an agent works
        </label>
        <label className="check">
          <input type="checkbox" checked={prefs.wrapUp} onChange={(e) => set({ wrapUp: e.target.checked })} /> When I quit, stop the agents' running commands and commit their unfinished work
        </label>
      </fieldset>
      <fieldset>
        <legend>New agents start with</legend>
        <label>
          Model
          <select aria-label="Model for new agents" value={prefs.defaults.model} onChange={(e) => setDefaults({ model: e.target.value })}>
            {MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Permissions
          <select value={prefs.defaults.permissionMode} onChange={(e) => setDefaults({ permissionMode: e.target.value })}>
            {PERMISSIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={prefs.defaults.inPlace} onChange={(e) => setDefaults({ inPlace: e.target.checked })} /> Work in my folder directly (no branch)
        </label>
      </fieldset>
      <fieldset>
        <legend>House rules</legend>
        <label>
          Added to every agent
          <textarea rows={4} value={rules} onChange={(e) => (setRules(e.target.value), set({ houseRules: e.target.value.trim() }))} placeholder="e.g. Keep commits small. Run the tests before saying you are done." />
          <span className="hint">Applies when an agent starts or wakes, ahead of its own instructions.</span>
        </label>
      </fieldset>
      <fieldset>
        <legend>Model by job</legend>
        {[...new Map(roles.map((r) => [r.title, r])).values()].map((r) => (
          <label key={r.title} className="row-label">
            {r.title}
            <select aria-label={`Model for ${r.title}`} value={prefs.roleModels[r.title] ?? ''} onChange={(e) => setRoleModel(r.title, e.target.value)}>
              {MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.value ? m.label : r.options.model ? `${r.options.model} (role's own)` : 'Default model'}
                </option>
              ))}
            </select>
          </label>
        ))}
        <span className="hint">Used when a job is hired from its role; the hire form can still change it.</span>
      </fieldset>
      <fieldset>
        <legend>Updates</legend>
        <label>
          Update address
          <input value={url} onChange={(e) => setUrl(e.target.value)} onBlur={() => url.trim() !== prefs.updateUrl && set({ updateUrl: url.trim() })} placeholder="https://example.com/agent-world/" />
          <span className="hint">A folder on the web holding the files the build step produces. Leave empty to never check.</span>
        </label>
        <div className="settings-row">
          <button onClick={() => void window.aw.checkUpdates().then((s) => setUpdate(s.detail ?? ({ checking: 'Checking…', none: 'You have the latest version.', available: 'Update found.', ready: 'Update ready.', error: 'Could not check.', off: '' }[s.state])))}>Check now</button>
          <span className="hint" role="status">{update}</span>
        </div>
      </fieldset>
      {providers.some((p) => p.detection.state === 'ready' && (p.mail === 'connected' || p.mail === 'missing')) && (
        <fieldset>
          <legend>Message box</legend>
          {providers.filter((p) => p.detection.state === 'ready' && (p.mail === 'connected' || p.mail === 'missing')).map((p) => (
            <div key={p.id} className="mc-line">
              <b>{p.label}</b>
              <MailConnect provider={p} onChanged={onProviders} />
            </div>
          ))}
        </fieldset>
      )}
      <fieldset>
        <legend>Setup</legend>
        <button onClick={onSetup} title="Walk through the first-run setup again: agent tools found here, project folder, defaults">Set up again</button>
      </fieldset>
      <fieldset>
        <legend>Claude program</legend>
        <label>
          Location
          <input value={path} onChange={(e) => setPath(e.target.value)} onBlur={() => path.trim() !== (prefs.providers.claude?.path ?? '') && set({ providers: { ...prefs.providers, claude: { path: path.trim() } } })} placeholder="claude (found on your PATH)" />
          <span className="hint">Only needed when the app cannot find it. Applies to agents started after this.</span>
        </label>
      </fieldset>
    </dialog>
  )
}
