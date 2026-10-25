import { useEffect, useRef, useState } from 'react'
import { UpdatePanel, useUpdateInfo } from './UpdateChip'
import { checkNowButton, updateView } from './updateView'
import { WhatsNew } from './ReleaseNotes'
import type { Role } from '../../shared/roles'
import type { Prefs, ProviderInfo } from '../../shared/types'
import { MailConnect } from './MailConnect'
import { parsePick, pickValue, storePick } from '../../shared/modelPick'
import { closeOnBackdrop } from './Modal'
import { ProviderTag } from './ProviderTag'
import { ProviderCard } from './ProviderCard'
import { useProviderSetup } from './useProviderSetup'
import { cssColor } from '../../shared/brand'
import { Accounts } from './Accounts'
import { TrackingCost } from '../todos/TrackingCost'
import { LibraryCostBox } from './LibraryCostBox'
import { switchWorkflows } from '../../shared/workflows'
import { WorkflowCost } from '../workflows/WorkflowCost'
import { WorkflowOffConfirm } from '../workflows/WorkflowOffConfirm'
import type { Run } from '../../shared/runs'

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

/** Where a program is when the app cannot find it on its own. */
function ProgramPath({ provider, saved, onSave }: { provider: ProviderInfo; saved: string; onSave: (path: string) => void }) {
  const [path, setPath] = useState(saved)
  return (
    <label className="set-path">
      Location of {provider.label}
      <input value={path} onChange={(e) => setPath(e.target.value)} onBlur={() => path.trim() !== saved && onSave(path.trim())} placeholder={`${provider.detection.path ?? provider.id} (found on your PATH)`} />
      <span className="hint">Only needed when the app cannot find it. Applies to agents started after this.</span>
    </label>
  )
}

/** A choice with a line under it, drawn as a switch. It is a checkbox underneath, so a keyboard and a screen reader treat it as one. */
function Switch({ checked, onChange, title, hint, disabled, child, role }: { checked: boolean; onChange: (on: boolean) => void; title: string; hint?: string; disabled?: boolean; role?: 'switch'; /** A feature that depends on the one above it: drawn indented under it. */ child?: boolean }) {
  return (
    <label className={`set-sw${disabled ? ' off' : ''}${child ? ' child' : ''}`}>
      <span><b>{title}</b>{hint && <small>{hint}</small>}</span>
      <input type="checkbox" role={role} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
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
export function Settings({ prefs, roles, onChange, onClose, onSetup, providers, onProviders, initialPane, signIns = 0, onSignIns, updateAgents = { working: 0, waiting: 0 } }: { initialPane?: string; /** Logins waiting for a sign-in: a dot on Accounts. */ signIns?: number; onSignIns?: (n: number) => void;  prefs: Prefs; roles: Role[]; onChange: (patch: Partial<Prefs>) => void; onClose: () => void; onSetup: () => void; providers: ProviderInfo[]; onProviders: () => void | Promise<void>; /** Agents at work or waiting for an answer, which a restart would put to sleep. */ updateAgents?: { working: number; waiting: number } }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [rules, setRules] = useState(prefs.houseRules)
  const [url, setUrl] = useState(prefs.updateUrl)
  // Turning workflows off while runs are open asks what to do with them first.
  const [asking, setAsking] = useState<Run[] | null>(null)
  const setWorkflows = (enabled: boolean) => set({ workflows: switchWorkflows(prefs.workflows, enabled, Date.now()) })
  const turnOff = async () => {
    const { runs, open } = await window.aw.workflows.summary()
    if (open === 0) return setWorkflows(false)
    setAsking(runs.filter((r) => r.status === 'open'))
  }
  // What the app last found about a newer version, said as it looks (and a page to open when this build cannot install it itself).
  const found = useUpdateInfo()
  const update = found.detail ?? { off: '', checking: 'Checking…', none: 'You have the latest version.', available: 'Update found.', ready: 'Update ready.', error: 'Could not check.' }[found.state]
  const shown = updateView(found, updateAgents)
  // The version that is installed, and its notes (read from the changelog that came with the app) in a dialog.
  const [version, setVersion] = useState('')
  const [notesOpen, setNotesOpen] = useState(false)
  useEffect(() => void window.aw.appInfo().then((i) => setVersion(i.version), () => undefined), [])
  const check = checkNowButton(found)
  useEffect(() => dialog.current?.showModal(), [])
  const set = (patch: Partial<Prefs>) => onChange(patch)
  const setRoleModel = (title: string, model: string) => {
    const { [title]: _, ...rest } = prefs.roleModels
    set({ roleModels: model ? { ...rest, [title]: model } : rest })
  }
  const setDefaults = (patch: Partial<Prefs['defaults']>) => set({ defaults: { ...prefs.defaults, ...patch } })
  const setSubagents = (patch: Partial<Prefs['subagents']>) => set({ subagents: { ...prefs.subagents, ...patch } })
  const ready = providers.filter((p) => p.detection.state === 'ready')
  const setup = useProviderSetup(providers, onProviders)
  // The program new agents use: the one chosen here, else the one chosen in setup, else the first that is ready.
  const startWith = ready.find((p) => p.id === (prefs.defaults.provider || prefs.setup.defaultProvider)) ?? ready[0]
  const [pane, setPane] = useState<Pane>(PANES.some((p) => p.id === initialPane) ? (initialPane as Pane) : 'general')
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
                {p.id === 'accounts' && signIns > 0 && (
                  <>
                    <i className="nav-dot" aria-hidden="true" data-testid="accounts-dot" />
                    <span className="sr-only"> ({signIns} to sign in)</span>
                  </>
                )}
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
              <Switch checked={prefs.officeLife} onChange={(officeLife) => set({ officeLife })} title="Office life" hint="An office boy and a supervisor walk about while agents work, and the cooler's water goes down and is refilled. Off: the office stays as still as the agents. Also off while your system asks for reduced motion." />
              <Switch checked={prefs.wrapUp} onChange={(wrapUp) => set({ wrapUp })} title="When I quit, stop the agents' running commands and commit their unfinished work" hint="Leaves every branch tidy." />
            </>
          )}
          {pane === 'features' && (
            <>
              <legend>Features</legend>
              <p className="set-lead">Features change what agents are told. They add text to messages, so each shows what it costs.</p>
              <Switch checked={prefs.libraryEnabled} onChange={(libraryEnabled) => set({ libraryEnabled })} title="Library and playbook" hint="The skills, instructions and prompts you keep once, and the playbook that says which an agent is told and when. Off: agents are told nothing from it, and the Library window and tab say it is off. Takes effect for agents started from now on and for each new message." />
              <LibraryCostBox />
              <Switch checked={prefs.todoTracking === 'full'} onChange={(on) => set({ todoTracking: on ? 'full' : 'deferred' })} title="Track every request as a todo" hint="Each message you send becomes a task on the project's Todos board that the agent works on and marks done. Off: agents record only what is put off. Takes effect for agents started from now on and for each new message." />
              <TrackingCost full={prefs.todoTracking === 'full'} />
              <Switch role="switch" checked={prefs.workflows.enabled} onChange={(enabled) => (enabled ? setWorkflows(true) : void turnOff())} title="Workflows" hint="Agents follow a pipeline of plan, implement, test, review and merge, with gates you approve, and every task is recorded round by round. Shows the Workflow tab and the Workflows button in the top bar." />
              {asking && (
                <WorkflowOffConfirm
                  open={asking}
                  onFinish={() => (setAsking(null), setWorkflows(false))}
                  onStop={() => void window.aw.workflows.stopAll().then(() => (setAsking(null), setWorkflows(false)))}
                  onCancel={() => setAsking(null)}
                />
              )}
              <Switch role="switch" checked={prefs.workflows.planGate} onChange={(planGate) => set({ workflows: { ...prefs.workflows, planGate } })} title="Plan gate" hint="With Workflows on, an agent that starts a task writes its plan first, says what it understood, and waits for you to approve it before it edits files. Claude agents are held back by the app; agy agents are only asked to wait." />
              <Switch role="switch" checked={prefs.workflows.mergeGate} onChange={(mergeGate) => set({ workflows: { ...prefs.workflows, mergeGate } })} title="Merge gate" hint="Holds back the push of the branch (or a merge, in a workflow that lands one) until the plan was approved. At the balanced and max dials a model also reads the branch against the plan and lists what it did not expect, which you tick off. Landing anyway is always possible and is recorded." />
              <WorkflowCost dial={prefs.workflows.dial} onDial={(dial) => set({ workflows: { ...prefs.workflows, dial } })} />
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
              <div className="settings-row"><button onClick={() => void onProviders()}>Re-scan</button></div>
              <div className="set-cards">
                {providers.map((p) => (
                  <div key={p.id} className="set-card">
                    <ProviderCard provider={p} setup={setup} isDefault={startWith?.id === p.id} onMakeDefault={() => set({ setup: { ...prefs.setup, defaultProvider: p.id }, defaults: { ...prefs.defaults, provider: p.id } })} />
                    <ProgramPath provider={p} saved={prefs.providers[p.id]?.path ?? ''} onSave={(path) => set({ providers: { ...prefs.providers, [p.id]: { path } } })} />
                  </div>
                ))}
              </div>
            </>
          )}
          {pane === 'accounts' && <Accounts prefs={prefs} providers={providers} onChange={set} onSignIns={onSignIns} />}
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
              <div className="upd-version">
                <b>Agent World {version}</b>
                <small>installed</small>
                <span className="grow" />
                <button className="su-link" onClick={() => setNotesOpen(true)}>What's new</button>
                <button onClick={() => void window.aw.checkUpdates()} disabled={check.disabled} title={check.reason}>{check.label}</button>
              </div>
              <p className="set-lead">Where to look for a newer version. Leave it empty to use this project's releases on GitHub, or give a folder on the web that holds the files the build step produces.</p>
              <label>
                Update address
                <input value={url} onChange={(e) => setUrl(e.target.value)} onBlur={() => url.trim() !== prefs.updateUrl && set({ updateUrl: url.trim() })} placeholder="https://example.com/agent-world/" />
              </label>
              <div className="settings-row">
                <span className="hint" role="status">{update}</span>
              </div>
              {notesOpen && <WhatsNew onClose={() => setNotesOpen(false)} />}
              {shown && (
                <div className="set-update">
                  <UpdatePanel view={shown} info={found} />
                  <p className="hint">This build is not signed with an Apple Developer ID, so an update is checked against the checksum published with its release on GitHub, and put in place by Agent World itself.</p>
                </div>
              )}
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
