import { useEffect, useRef, useState } from 'react'
import type { Role } from '../../shared/roles'
import type { Prefs, ProviderInfo } from '../../shared/types'
import { MailConnect } from './MailConnect'
import { parsePick, pickValue, storePick } from '../../shared/modelPick'
import { closeOnBackdrop } from './Modal'
import { ProviderTag } from './ProviderTag'
import { cssColor } from '../../shared/brand'
import { Accounts } from './Accounts'
import { TrackingCost } from '../todos/TrackingCost'
import { CheckCost } from './CheckCost'

/** Models of every program that is ready, each program's under its own heading. */
function ModelOptions({ providers, own }: { providers: ProviderInfo[]; own?: string }) {
  return (
    <>
      {own !== undefined && <option value="">{own}</option>}
      {providers.map((p) => (
        <optgroup key={p.id} label={p.label}>
          {p.models.map((m) => (
            <option key={m.value} value={pickValue(p.id, m.value)}>
              {m.value ? m.label : `${p.label} default`}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  )
}

/** One program: whether it works here, and where it is when the app cannot find it on its own. */
function ProgramCard({ provider, saved, onSave, onRescan }: { provider: ProviderInfo; saved: string; onSave: (path: string) => void; onRescan: () => void }) {
  const [path, setPath] = useState(saved)
  const d = provider.detection
  return (
    <div className="set-prog" style={{ ['--c' as string]: cssColor(provider.id) }}>
      <div className="top">
        <ProviderTag id={provider.id} label={provider.label} />
        <small data-state={d.state}>{d.state === 'ready' ? `● ready${d.version ? ` · ${d.version}` : ''}` : d.state === 'needs-sign-in' ? '● not signed in' : '● not found'}</small>
      </div>
      <label>
        Location
        <input value={path} onChange={(e) => setPath(e.target.value)} onBlur={() => path.trim() !== saved && onSave(path.trim())} placeholder={`${d.path ?? provider.id} (found on your PATH)`} />
        <span className="hint">Only needed when the app cannot find it. Applies to agents started after this.</span>
      </label>
      <div className="settings-row"><button onClick={onRescan}>Re-scan</button></div>
    </div>
  )
}

/** A choice with a line under it, drawn as a switch. It is a checkbox underneath, so a keyboard and a screen reader treat it as one. */
function Switch({ checked, onChange, title, hint }: { checked: boolean; onChange: (on: boolean) => void; title: string; hint?: string }) {
  return (
    <label className="set-sw">
      <span><b>{title}</b>{hint && <small>{hint}</small>}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

const PANES = [
  { id: 'general', group: 'Office', label: 'General', icon: '⚙' },
  { id: 'features', group: 'Office', label: 'Features', icon: '✓' },
  { id: 'agents', group: 'Office', label: 'New agents', icon: '☺' },
  { id: 'rules', group: 'Office', label: 'House rules', icon: '☰' },
  { id: 'programs', group: 'Programs', label: 'Providers', icon: '▣' },
  { id: 'accounts', group: 'Programs', label: 'Accounts', icon: '◉' },
  { id: 'jobs', group: 'Programs', label: 'Model by job', icon: '⚒' },
  { id: 'mail', group: 'App', label: 'Message box', icon: '✉' },
  { id: 'updates', group: 'App', label: 'Updates', icon: '↻' },
  { id: 'setup', group: 'App', label: 'Setup', icon: '⌂' }
] as const
type Pane = (typeof PANES)[number]['id']

/** Preferences that outlive a session. Each change is saved as it is made. */
export function Settings({ prefs, roles, onChange, onClose, onSetup, providers, onProviders }: { prefs: Prefs; roles: Role[]; onChange: (patch: Partial<Prefs>) => void; onClose: () => void; onSetup: () => void; providers: ProviderInfo[]; onProviders: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
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
  const setSubagents = (patch: Partial<Prefs['subagents']>) => set({ subagents: { ...prefs.subagents, ...patch } })
  const ready = providers.filter((p) => p.detection.state === 'ready')
  // The program new agents use: the one chosen here, else the one chosen in setup, else the first that is ready.
  const startWith = ready.find((p) => p.id === (prefs.defaults.provider || prefs.setup.defaultProvider)) ?? ready[0]
  const [pane, setPane] = useState<Pane>('general')
  // Check before acting lives in the library's own settings; it is read here so the switch shows what is saved.
  const [check, setCheck] = useState(true)
  useEffect(() => void window.aw.library.features().then((f) => setCheck(f.forcedCheck), () => undefined), [])
  const connectable = providers.filter((p) => p.detection.state === 'ready' && (p.mail === 'connected' || p.mail === 'missing'))
  const panes = PANES.filter((p) => p.id !== 'mail' || connectable.length > 0)
  const modes = startWith?.hireModes ?? []
  const mode = modes.some((m) => m.value === prefs.defaults.permissionMode) ? prefs.defaults.permissionMode : ''
  return (
    <dialog ref={dialog} className="settings settings-v2" aria-label="Settings" onClose={onClose} onCancel={onClose} {...closeOnBackdrop(onClose)}>
      <nav className="set-nav" role="tablist" aria-label="Settings sections" aria-orientation="vertical">
        {(['Office', 'Programs', 'App'] as const).map((g) => (
          <div key={g}>
            <span className="g">{g}</span>
            {panes.filter((p) => p.group === g).map((p) => (
              <button key={p.id} role="tab" id={`set-tab-${p.id}`} aria-selected={pane === p.id} aria-controls={`set-pane-${p.id}`} className={pane === p.id ? 'on' : ''} onClick={() => setPane(p.id)}>
                <span aria-hidden="true">{p.icon}</span>{p.label}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="set-main">
        <header className="settings-head">
          <b>Settings</b>
          <button onClick={onClose} aria-label="Close settings">
            Close
          </button>
        </header>
        <fieldset role="tabpanel" id={`set-pane-${pane}`} aria-labelledby={`set-tab-${pane}`} className="set-pane" key={pane}>
          {pane === 'general' && (
            <>
              <legend>General</legend>
              <p className="set-lead">How the office alerts you, and what it does when you leave.</p>
              <label>
                Notifications
                <select value={prefs.notifications} onChange={(e) => set({ notifications: e.target.value as Prefs['notifications'] })}>
                  <option value="all">When an agent needs me or finishes</option>
                  <option value="attention">Only when an agent needs me</option>
                  <option value="off">Never</option>
                </select>
              </label>
              <Switch checked={prefs.keepAwake} onChange={(keepAwake) => set({ keepAwake })} title="Keep the computer awake while an agent works" hint="Sleep is stopped only while something is running." />
              <Switch checked={prefs.openPagesInApp} onChange={(openPagesInApp) => set({ openPagesInApp })} title="Open pages in the app preview" hint="When an agent opens an HTML page in a browser, also show it in that agent's Preview tab. The command it ran still runs." />
              <Switch checked={prefs.wrapUp} onChange={(wrapUp) => set({ wrapUp })} title="When I quit, stop the agents' running commands and commit their unfinished work" hint="Leaves every branch tidy." />
            </>
          )}
          {pane === 'features' && (
            <>
              <legend>Features</legend>
              <p className="set-lead">Features change what agents are told. They add text to messages, so each shows what it costs.</p>
              <Switch checked={check} onChange={(forcedCheck) => void window.aw.library.setFeatures({ forcedCheck }).then((f) => setCheck(f.forcedCheck), () => undefined)} title="Check before acting" hint="When a rule in your library is marked hard, the agent says which apply to the request, reads the one that does, and reports the ones it skips. Nothing is added until a rule is hard." />
              <CheckCost />
              <Switch checked={prefs.todoTracking === 'full'} onChange={(on) => set({ todoTracking: on ? 'full' : 'deferred' })} title="Track every request as a todo" hint="Each message you send becomes a task on the project's Todos board that the agent works on and marks done. Off: agents record only what is put off. Takes effect for agents started from now on and for each new message." />
              <TrackingCost full={prefs.todoTracking === 'full'} />
            </>
          )}
          {pane === 'agents' && (
            <>
              <legend>New agents start with</legend>
              <p className="set-lead">What the hire form opens with. Each hire can still change it.</p>
              <label>
                Model
                <select
                  aria-label="Model for new agents"
                  value={pickValue(startWith?.id ?? '', prefs.defaults.model)}
                  onChange={(e) => {
                    const { provider, model } = parsePick(e.target.value)
                    const next = providers.find((p) => p.id === provider)?.hireModes ?? []
                    // How much it may do alone is a program's own list: a choice the new program does not have goes back to its default.
                    setDefaults({ provider, model, permissionMode: next.some((m) => m.value === prefs.defaults.permissionMode) ? prefs.defaults.permissionMode : '' })
                  }}
                >
                  <ModelOptions providers={ready} />
                </select>
              </label>
              <div className="hire-pick" role="radiogroup" aria-label="Permissions">
                <span className="lab">Permissions</span>
                <div className="hire-opts">
                  {modes.map((m) => (
                    <label key={m.value} className="hire-opt" data-on={mode === m.value} data-risk={m.value === 'skip-permissions' || m.value === 'bypassPermissions'}>
                      <input type="radio" name="new-permissions" value={m.value} checked={mode === m.value} onChange={() => setDefaults({ permissionMode: m.value })} />
                      <b>{m.label}</b>
                      <span className="hint">{m.hint}</span>
                    </label>
                  ))}
                </div>
              </div>
              <Switch checked={prefs.defaults.inPlace} onChange={(inPlace) => setDefaults({ inPlace })} title="Work in my folder directly (no branch)" hint="No branch and no worktree: agents on one folder can overwrite each other." />
              <div className="set-sub" role="group" aria-label="Subagents">
                <span className="lab">Subagents</span>
                <p className="hint">When an agent starts another as its subagent (Claude or agy, either way), these keep it from running away.</p>
                <label>
                  Levels deep
                  <select aria-label="Levels of subagents" value={prefs.subagents.maxDepth} onChange={(e) => setSubagents({ maxDepth: Number(e.target.value) })}>
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>{n === 1 ? '1: an agent may start subagents, they may not' : n === 2 ? '2: a subagent may start subagents too (default)' : `${n}`}</option>
                    ))}
                  </select>
                </label>
                <label>
                  At once under one agent
                  <select aria-label="Subagents at once" value={prefs.subagents.maxRunning} onChange={(e) => setSubagents({ maxRunning: Number(e.target.value) })}>
                    {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                      <option key={n} value={n}>{n === 3 ? '3 (default)' : n}</option>
                    ))}
                  </select>
                </label>
              </div>
            </>
          )}
          {pane === 'rules' && (
            <>
              <legend>House rules</legend>
              <p className="set-lead">Added ahead of every agent's own instructions, when it starts or wakes.</p>
              <label>
                Added to every agent
                <textarea rows={9} value={rules} onChange={(e) => (setRules(e.target.value), set({ houseRules: e.target.value.trim() }))} placeholder="e.g. Keep commits small. Run the tests before saying you are done." />
                <span className="hint">Applies to every program.</span>
              </label>
            </>
          )}
          {pane === 'programs' && (
            <>
              <legend>Providers</legend>
              <p className="set-lead">The programs agents can run: whether each works here, and where it is.</p>
              <div className="set-progs">
                {providers.map((p) => (
                  <ProgramCard key={p.id} provider={p} saved={prefs.providers[p.id]?.path ?? ''} onSave={(path) => set({ providers: { ...prefs.providers, [p.id]: { path } } })} onRescan={onProviders} />
                ))}
              </div>
            </>
          )}
          {pane === 'accounts' && <Accounts prefs={prefs} providers={providers} onChange={set} />}
          {pane === 'jobs' && (
            <>
              <legend>Model by job</legend>
              <p className="set-lead">Used when a job is hired from its role. Each program's models are listed under it; the hire form can still change it.</p>
              {[...new Map(roles.map((r) => [r.title, r])).values()].map((r) => (
                <label key={r.title} className="row-label">
                  {r.title}
                  <select aria-label={`Model for ${r.title}`} value={(() => { const v = prefs.roleModels[r.title]; if (!v) return ''; const k = parsePick(v); return pickValue(k.provider, k.model) })()} onChange={(e) => { const k = parsePick(e.target.value); setRoleModel(r.title, e.target.value ? storePick(k.provider, k.model) : '') }}>
                    <ModelOptions providers={ready} own={r.options.model ? `${r.options.model} (role's own)` : 'Default model'} />
                  </select>
                </label>
              ))}
            </>
          )}
          {pane === 'mail' && (
            <>
              <legend>Message box</legend>
              <p className="set-lead">Lets agents message each other. Each program is connected once.</p>
              {connectable.map((p) => (
                <div key={p.id} className="mc-line">
                  <b>{p.label}</b>
                  <MailConnect provider={p} onChanged={onProviders} />
                </div>
              ))}
            </>
          )}
          {pane === 'updates' && (
            <>
              <legend>Updates</legend>
              <p className="set-lead">A folder on the web holding the files the build step produces. Leave empty to never check.</p>
              <label>
                Update address
                <input value={url} onChange={(e) => setUrl(e.target.value)} onBlur={() => url.trim() !== prefs.updateUrl && set({ updateUrl: url.trim() })} placeholder="https://example.com/agent-world/" />
              </label>
              <div className="settings-row">
                <button onClick={() => void window.aw.checkUpdates().then((s) => setUpdate(s.detail ?? ({ checking: 'Checking…', none: 'You have the latest version.', available: 'Update found.', ready: 'Update ready.', error: 'Could not check.', off: '' }[s.state])))}>Check now</button>
                <span className="hint" role="status">{update}</span>
              </div>
            </>
          )}
          {pane === 'setup' && (
            <>
              <legend>Setup</legend>
              <p className="set-lead">Walk through the first-run setup again: the agent tools found here, the project folder and the defaults.</p>
              <div className="settings-row"><button onClick={onSetup} title="Walk through the first-run setup again: agent tools found here, project folder, defaults">Set up again</button></div>
            </>
          )}
        </fieldset>
      </div>
    </dialog>
  )
}
