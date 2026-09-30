import { useEffect, useRef, useState } from 'react'
import type { Prefs } from '../../shared/types'
import { MODELS } from './HireForm'

const PERMISSIONS = [
  { value: '', label: "Claude's default" },
  { value: 'manual', label: 'Ask for everything' },
  { value: 'acceptEdits', label: 'Accept edits' },
  { value: 'plan', label: 'Plan first' }
]

/** Preferences that outlive a session. Each change is saved as it is made. */
export function Settings({ prefs, onChange, onClose }: { prefs: Prefs; onChange: (p: Prefs) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [path, setPath] = useState(prefs.claudePath)
  const [url, setUrl] = useState(prefs.updateUrl)
  const [update, setUpdate] = useState('')
  useEffect(() => window.aw.onUpdateState((s) => s.detail && setUpdate(s.detail)), [])
  useEffect(() => dialog.current?.showModal(), [])
  const set = (patch: Partial<Prefs>) => onChange({ ...prefs, ...patch })
  const setDefaults = (patch: Partial<Prefs['defaults']>) => set({ defaults: { ...prefs.defaults, ...patch } })
  return (
    <dialog ref={dialog} className="settings" aria-label="Settings" onClose={onClose} onCancel={onClose}>
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
      </fieldset>
      <fieldset>
        <legend>New agents start with</legend>
        <label>
          Model
          <select value={prefs.defaults.model} onChange={(e) => setDefaults({ model: e.target.value })}>
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
      <fieldset>
        <legend>Claude program</legend>
        <label>
          Location
          <input value={path} onChange={(e) => setPath(e.target.value)} onBlur={() => path.trim() !== prefs.claudePath && set({ claudePath: path.trim() })} placeholder="claude (found on your PATH)" />
          <span className="hint">Only needed when the app cannot find it. Applies to agents started after this.</span>
        </label>
      </fieldset>
    </dialog>
  )
}
