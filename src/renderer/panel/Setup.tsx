import { useEffect, useRef, useState } from 'react'
import type { Workspaces } from '../../shared/api'
import { MailConnect } from './MailConnect'
import { TerminalView } from './TerminalView'
import type { AgentOptions, AutonomyLevel, Prefs, ProviderId, ProviderInfo } from '../../shared/types'
import { ProviderLogo } from './ProviderLogo'
import { TrackingCost } from '../todos/TrackingCost'
import { CheckCost } from './CheckCost'

const STEPS = [
  { id: 'welcome', name: 'Welcome' },
  { id: 'agents', name: 'Your agents' },
  { id: 'folder', name: 'Project folder' },
  { id: 'defaults', name: 'Defaults' },
  { id: 'features', name: 'Features' },
  { id: 'hire', name: 'First agent' }
] as const

const LEVELS: { id: AutonomyLevel; label: string; blurb: string }[] = [
  { id: 'ask', label: 'Ask first', blurb: 'Asks before it edits or runs anything.' },
  { id: 'edit', label: 'Auto-edit', blurb: 'Edits files freely, asks before running commands.' },
  { id: 'plan', label: 'Plan first', blurb: 'Reads and plans, changes nothing until you approve.' },
  { id: 'full', label: 'Full auto', blurb: 'Does everything without asking. Use on throwaway branches.' }
]

const STATE_LABEL = { ready: 'Ready', 'needs-sign-in': 'Needs sign-in', 'not-installed': 'Not installed', unsupported: 'Not supported' } as const

interface Props {
  providers: ProviderInfo[]
  /** Tools found here that no longer work: named, never offered. */
  prefs: Prefs
  onPrefs: (patch: Partial<Prefs>) => void
  workspaces: Workspaces | null
  folder: string | null
  onPick: () => void
  onOpen: (path: string) => void
  onRescan: () => void | Promise<void>
  onHire: (options: AgentOptions, name: string, crew: boolean) => Promise<void>
  /** Setup was closed without hiring (it closes itself when it hires). */
  onClose: () => void
  /** Reopened from Settings: it can be closed at any step. */
  reopened: boolean
}

/** First run: what is on this machine, where to work, how much freedom agents get, and the first agent. Skippable except where nothing else would work. */
export function Setup({ providers, prefs, onPrefs, workspaces, folder, onPick, onOpen, onRescan, onHire, onClose, reopened }: Props) {
  const ready = providers.filter((p) => p.detection.state === 'ready')
  const [step, setStep] = useState(0)
  const [visited, setVisited] = useState(() => new Set([0]))
  const [skipped, setSkipped] = useState(() => new Set<number>())
  const [level, setLevel] = useState<AutonomyLevel>('ask')
  const [name, setName] = useState('')
  const [crew, setCrew] = useState(false)
  const [busy, setBusy] = useState(false)
  // The library's check before acting: on unless turned off here, and changed at once (it is a switch, not a form).
  const [check, setCheck] = useState(true)
  useEffect(() => void window.aw.library.features().then((f) => setCheck(f.forcedCheck), () => undefined), [])
  const [howto, setHowto] = useState<string | null>(null)
  // The terminal where a provider's own sign-in runs, opened on request and shown right in the step.
  const [signIn, setSignIn] = useState<{ provider: ProviderId; pty: string } | null>(null)
  const openSignIn = async (provider: ProviderId) => {
    if (signIn) window.aw.closeShell(signIn.pty)
    setSignIn({ provider, pty: await window.aw.openSignIn(provider) })
  }
  const doneSigningIn = () => {
    if (signIn) window.aw.closeShell(signIn.pty)
    setSignIn(null)
    onRescan()
  }
  // Re-scan shows it is working (the check can take a few seconds) and says what it found.
  const [scan, setScan] = useState<'idle' | 'busy' | 'found' | 'none'>('idle')
  const rescan = async () => {
    setScan('busy')
    await Promise.all([Promise.resolve(onRescan()), new Promise((r) => setTimeout(r, 700))])
    setScan('found')
  }
  const root = useRef<HTMLDivElement>(null)
  const chosen = ready.find((p) => p.id === prefs.setup.defaultProvider) ?? ready[0]
  const [hireWith, setHireWith] = useState('')
  const hirer = ready.find((p) => p.id === hireWith) ?? chosen
  const id = STEPS[step]!.id
  const last = step === STEPS.length - 1
  const unlinked = ready.filter((p) => p.mail === 'missing')
  const blocked = id === 'agents' && (ready.length === 0 || unlinked.length > 0)
  const canHire = !!hirer && !!folder

  useEffect(() => root.current?.querySelector<HTMLElement>('h3')?.focus(), [step])

  const go = (to: number, skip = false) => {
    setSkipped((s) => {
      const n = new Set(s)
      if (skip) n.add(step)
      n.delete(to)
      return n
    })
    setVisited((v) => new Set(v).add(to))
    setStep(to)
  }
  const finish = async () => {
    if (!hirer || !folder) return
    setBusy(true)
    try {
      const mode = hirer.autonomy[level]
      onPrefs({ setup: { done: true, defaultProvider: hirer.id }, defaults: { ...prefs.defaults, permissionMode: mode ?? '' } })
      await onHire({ provider: hirer.id, ...(mode && { permissionMode: mode as AgentOptions['permissionMode'] }) }, name.trim(), crew)
    } finally {
      setBusy(false)
    }
  }
  const close = () => {
    onPrefs({ setup: { ...prefs.setup, done: true } })
    onClose()
  }
  const eyebrow = `Step ${step + 1} of ${STEPS.length}`

  const providerRow = (p: ProviderInfo) => {
    const st = p.detection.state
    const on = st === 'ready' && chosen?.id === p.id
    return (
      <div key={p.id} className={`su-prov ${on ? 'pick' : ''}`} data-provider={p.id}>
        <span className="su-mark"><ProviderLogo id={p.id} /></span>
        <div className="su-name">
          {p.label}
          <span className={`su-state ${st}`}>{STATE_LABEL[st]}</span>
        </div>
        <div className="su-act">
          {st === 'ready' ? (
            <label className={`su-radio ${on ? 'on' : ''}`}>
              <i />
              {on ? 'Default for new agents' : <button className="su-link" onClick={() => onPrefs({ setup: { ...prefs.setup, defaultProvider: p.id } })}>Make default</button>}
            </label>
          ) : st === 'needs-sign-in' ? (
            <button className="primary" onClick={() => void openSignIn(p.id)}>
              Open a terminal to sign in
            </button>
          ) : st === 'not-installed' ? (
            <button onClick={() => setHowto(howto === p.id ? null : p.id)} aria-expanded={howto === p.id}>
              How to install
            </button>
          ) : null}
        </div>
        <div className="su-sub">{p.detection.version ? `v${p.detection.version}${p.detection.path ? ` · ${p.detection.path}` : ''}` : 'not found'}</div>
        <div className="su-extra">
          {p.detection.hint && <span className="hint">{p.detection.hint}</span>}
          {howto === p.id && p.detection.install && <code className="su-howto">{p.detection.install}</code>}
          {st === 'ready' && <MailConnect provider={p} onChanged={onRescan} required />}
          {signIn?.provider === p.id && (
            <div className="su-signin">
              <div className="su-term"><TerminalView ptyId={signIn.pty} visible focusTick={0} /></div>
              <div className="su-row">
                <span className="hint">Sign in there, in the program's own window. The app never sees what you type.</span>
                <button className="primary" onClick={doneSigningIn}>I have signed in: check again</button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="su-overlay" role="dialog" aria-modal="true" aria-label="First-run setup" ref={root}>
      <div className="su-win">
        <div className="su-rail" role="group" aria-label="Setup steps">
          <span className="su-brand">Agent World</span>
          {STEPS.map((s, i) => {
            const done = visited.has(i) && i < step && !skipped.has(i)
            return (
              <div key={s.id} className={`su-step ${i === step ? 'on' : ''} ${done ? 'done' : ''} ${skipped.has(i) ? 'skipped' : ''}`} aria-current={i === step ? 'step' : undefined}>
                <span className="n">{done ? '✓' : i + 1}</span>
                {s.name}
                {i === 1 ? <span className="tag">required</span> : skipped.has(i) ? <span className="tag">skipped</span> : null}
              </div>
            )
          })}
          <span className="foot">You can run this again from Settings, under Set up again.</span>
        </div>
        <div className="su-body">
          {id === 'welcome' && (
            <>
              <div className="su-head">
                <span className="su-eyebrow">{eyebrow}</span>
                <h3 tabIndex={-1}>Welcome to Agent World</h3>
                <p>Each agent is a real coding agent running in its own terminal and its own git branch. You watch them work from the office and step in when they ask.</p>
              </div>
              <ul className="su-points">
                <li><b>Your own tools, your own login.</b> The app launches the agents you already have installed and never sees your credentials.</li>
                <li><b>You stay in control.</b> Agents ask before they edit or run anything, unless you choose otherwise in a later step.</li>
                <li><b>Your project stays safe.</b> Agents work on their own branch unless you say otherwise.</li>
              </ul>
            </>
          )}
          {id === 'agents' && (
            <>
              <div className="su-head">
                <span className="su-eyebrow">{eyebrow}</span>
                <h3 tabIndex={-1}>Your agents</h3>
                <p>These are the agent tools found on this computer. Pick the one new agents should use by default; you can mix them later.</p>
              </div>
              <div className="su-content">
                {providers.map(providerRow)}
                {ready.length === 0 ? (
                  <div className="su-note"><b>Nothing is ready yet.</b> Install or sign in to at least one of them, then press Re-scan. You cannot hire an agent until then.</div>
                ) : ready.length === 1 && providers.length > 1 ? (
                  <div className="su-note ok">One is ready, which is enough to start. You can add the other any time from Settings.</div>
                ) : null}
                <div className="su-row">
                  <button onClick={() => void rescan()} disabled={scan === 'busy'} aria-busy={scan === 'busy'}>
                    {scan === 'busy' ? <><span className="su-spin" aria-hidden="true" />Scanning…</> : 'Re-scan'}
                  </button>
                  <span className="hint" role="status">{scan === 'busy' ? 'Looking for claude and agy…' : scan === 'found' ? (ready.length ? `Found: ${ready.map((p) => p.label).join(', ')}` : 'Nothing found yet.') : ''}</span>
                </div>
              </div>
            </>
          )}
          {id === 'folder' && (
            <>
              <div className="su-head">
                <span className="su-eyebrow">{eyebrow}</span>
                <h3 tabIndex={-1}>Pick your project folder</h3>
                <p>Every agent works on this folder, each on its own branch. You can open more projects later, and each window can show a different one.</p>
              </div>
              <div className="su-cards">
                {(workspaces?.items ?? []).filter((w) => w.exists).slice(0, 4).map((w) => (
                  <button key={w.path} className="su-card" aria-pressed={folder === w.path} onClick={() => onOpen(w.path)} title={w.path}>
                    <b>{w.name}</b>
                    <small>{w.git ? 'git' : 'no git, agents share the folder'}</small>
                  </button>
                ))}
                <button className="su-card dashed" onClick={onPick}>
                  <b>Open a folder…</b>
                  <small>{folder && !(workspaces?.items ?? []).some((w) => w.path === folder) ? folder : 'Any folder on this computer'}</small>
                </button>
              </div>
            </>
          )}
          {id === 'defaults' && (
            <>
              <div className="su-head">
                <span className="su-eyebrow">{eyebrow}</span>
                <h3 tabIndex={-1}>How much may they do alone?</h3>
                <p>This is the starting point for every new agent. Each can be changed per agent later.</p>
              </div>
              <div className="su-content">
                <div className="su-cards">
                  {LEVELS.map((l) => (
                    <button key={l.id} className="su-card" aria-pressed={level === l.id} onClick={() => setLevel(l.id)}>
                      <b>{l.label}</b>
                      <small>{l.blurb}</small>
                      <small className="mapped">{ready.map((p) => `${p.label}: ${p.autonomy[l.id] ?? 'not offered'}`).join(' · ')}</small>
                    </button>
                  ))}
                </div>
                <div className="su-row">
                  <button className="su-toggle" aria-pressed={prefs.notifications === 'all'} onClick={() => onPrefs({ notifications: prefs.notifications === 'all' ? 'attention' : 'all' })}>
                    <i />Tell me when an agent finishes, if I am in another app
                  </button>
                  <button className="su-toggle" aria-pressed={prefs.wrapUp} onClick={() => onPrefs({ wrapUp: !prefs.wrapUp })}>
                    <i />Commit unfinished work to each agent's own branch when I quit
                  </button>
                </div>
              </div>
            </>
          )}
          {id === 'features' && (
            <>
              <div className="su-head">
                <span className="su-eyebrow">{eyebrow}</span>
                <h3 tabIndex={-1}>Which features should agents use?</h3>
                <p>Features change what agents are told. They add a little text to each message, so each shows what it costs. You can change them any time in Settings, under Features.</p>
              </div>
              <div className="su-content">
                <button className="su-toggle" role="switch" aria-checked={check} aria-label="Check before acting" onClick={() => void window.aw.library.setFeatures({ forcedCheck: !check }).then((f) => setCheck(f.forcedCheck), () => undefined)}>
                  <i />
                  <span><b>Check before acting</b><small>When a rule in your library is marked hard, the agent says which apply to the request, reads the one that does, and reports the ones it skips. Nothing is added until a rule is hard.</small></span>
                </button>
                <CheckCost />
                <button className="su-toggle" role="switch" aria-checked={prefs.todoTracking === 'full'} aria-label="Track every request as a todo" onClick={() => onPrefs({ todoTracking: prefs.todoTracking === 'full' ? 'deferred' : 'full' })}>
                  <i />
                  <span><b>Track every request as a todo</b><small>Each message you send becomes a task on the project's Todos board, and the agent works on it and marks it done, so everything is recorded and can be found again. Off: agents record only what is put off. Adds a little text to each message.</small></span>
                </button>
                <TrackingCost full={prefs.todoTracking === 'full'} />
              </div>
            </>
          )}
          {id === 'hire' && (
            <>
              <div className="su-head">
                <span className="su-eyebrow">{eyebrow}</span>
                <h3 tabIndex={-1}>Hire your first agent</h3>
                <p>Choose who works first. You can hire more, of either kind, whenever you like.</p>
              </div>
              <div className="su-content">
                <div className="su-row">
                  <div className="su-field">
                    <label htmlFor="su-name">Name</label>
                    <input id="su-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="picked for you" maxLength={24} />
                  </div>
                  <div className="su-field">
                    <label htmlFor="su-provider">Provider</label>
                    <select id="su-provider" value={hirer?.id ?? ''} onChange={(e) => setHireWith(e.target.value)} disabled={!ready.length}>
                      {ready.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                      {!ready.length && <option value="">None ready</option>}
                    </select>
                  </div>
                </div>
                {!ready.length ? (
                  <div className="su-note">No provider is ready, so nobody can be hired. Go back to step 2.</div>
                ) : !folder ? (
                  <div className="su-note">No project folder is chosen. Go back to step 3.</div>
                ) : (
                  <p className="hint">Will start in <b>{folder.split(/[\\/]/).filter(Boolean).pop()}</b>, on its own branch, set to <b>{LEVELS.find((l) => l.id === level)!.label}</b>.</p>
                )}
                <button className="su-toggle" aria-pressed={crew} onClick={() => setCrew(!crew)}>
                  <i />Also hire a starter crew (Explorer, Test writer, Reviewer)
                </button>
              </div>
            </>
          )}
          <div className="su-nav">
            {step > 0 && <button onClick={() => go(step - 1)}>Back</button>}
            {step > 1 && !last && <button className="su-link" onClick={() => go(step + 1, true)}>Skip for now</button>}
            {blocked && <span className="su-why">{ready.length === 0 ? 'Install or sign in to one agent tool to continue.' : `Connect ${unlinked.map((p) => p.label).join(' and ')} to the message box to continue.`}</span>}
            {reopened && <button className="su-link" onClick={close}>Close</button>}
            <button className="primary su-push" disabled={blocked || busy || (last && !canHire)} onClick={() => (last ? void finish() : go(step + 1))}>
              {last ? 'Hire and finish' : 'Continue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
