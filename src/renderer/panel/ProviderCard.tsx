import { type ReactNode, useState } from 'react'
import type { ProviderInfo } from '../../shared/types'
import { ProviderLogo } from './ProviderLogo'
import { TerminalView } from './TerminalView'
import { setupSteps } from './setupSteps'
import type { useProviderSetup } from './useProviderSetup'

const STATE_LABEL = { ready: 'Ready', 'needs-sign-in': 'Needs sign-in', 'not-installed': 'Not installed', unsupported: 'Not supported', installing: 'Installing' } as const

// A terminal that opens below the fold is brought into view, so the person sees what to paste where.
const reveal = (el: HTMLElement | null) => el?.scrollIntoView({ block: 'nearest' })

/**
 * One provider as Setup and Settings both show it: what state it is in, the one next action (install, sign in, make default), its installer or
 * sign-in terminal right under it, and where it was found. `children` is whatever else belongs to a ready one in that place.
 */
export function ProviderCard({ provider: p, setup, isDefault, onMakeDefault, children }: { provider: ProviderInfo; setup: ReturnType<typeof useProviderSetup>; isDefault: boolean; onMakeDefault: () => void; children?: ReactNode }) {
  const { install, installNote, signIn, installed, runInstall, openSignIn, doneSigningIn } = setup
  const [copied, setCopied] = useState(false)
  const copy = (text: string) => void navigator.clipboard.writeText(text).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1200)))
  const installing = install?.provider === p.id
  const st = installing ? 'installing' : p.detection.state
  const on = st === 'ready' && isDefault
  // The installer ended and the tool is still not there.
  const signingIn = signIn?.provider === p.id
  const fresh = st === 'needs-sign-in' && installed.includes(p.id)
  const steps = st === 'ready' || st === 'unsupported' ? [] : setupSteps(st === 'installing' ? 'not-installed' : st, { version: p.detection.version, installing, signingIn })
  const stillMissing = !installing && st === 'not-installed' && installNote?.provider === p.id && installNote.text === ''
  return (
    <div className={`su-prov ${on ? 'pick' : ''}`} data-provider={p.id}>
      <span className="su-mark"><ProviderLogo id={p.id} /></span>
      <div className="su-name">
        {p.label}
        <span className={`su-state ${st}`}>{fresh ? 'Installed · next: sign in' : STATE_LABEL[st]}</span>
      </div>
      <div className="su-act">
        {st === 'ready' ? (
          <label className={`su-radio ${on ? 'on' : ''}`}>
            <i />
            {on ? 'Default for new agents' : <button className="su-link" onClick={onMakeDefault}>Make default</button>}
          </label>
        ) : st === 'needs-sign-in' ? (
          <button className="primary" onClick={() => void openSignIn(p.id)}>
            Open a terminal to sign in
          </button>
        ) : st === 'not-installed' && p.detection.install ? (
          <button className="primary" onClick={() => void runInstall(p)}>
            {stillMissing || installNote?.provider === p.id ? 'Try again' : `Install ${p.label}`}
          </button>
        ) : null}
      </div>
      <div className="su-sub">{p.detection.version ? `v${p.detection.version}${p.detection.path ? ` · ${p.detection.path}` : ''}` : 'not found'}</div>
      <div className="su-extra">
        {steps.length > 0 && (
          <ol className="su-steps" aria-label="Steps">
            {steps.map((x, i) => (
              <li key={x.name} data-done={x.status === 'done'} aria-current={x.status === 'now' ? 'step' : undefined}>
                <span className="n">{x.status === 'done' ? '✓' : i + 1}</span>
                <span>
                  <b>{x.name}</b>
                  {x.hint}
                </span>
              </li>
            ))}
          </ol>
        )}
        {p.detection.hint && <span className="hint">{p.detection.hint}</span>}
        {st === 'not-installed' && p.detection.install && (
          <div className="su-cmd">
            <code className="su-howto">{p.detection.install}</code>
            <button className="su-link" onClick={() => copy(p.detection.install!)}>{copied ? 'Copied' : 'Copy'}</button>
          </div>
        )}
        {stillMissing && <span className="su-why" role="alert">The installer stopped and {p.label} is still not found. Nothing was changed. Try again, or copy the command into a terminal.</span>}
        {installNote?.provider === p.id && installNote.text !== '' && <span className="su-why" role="alert">{installNote.text}</span>}
        {installing && (
          <div className="su-signin su-install-term" ref={reveal}>
            <div className="su-term"><TerminalView ptyId={install!.pty} visible focusTick={0} /></div>
            <span className="hint" role="status"><span className="su-spin" aria-hidden="true" />Running {p.label}'s installer. It looks again by itself when it ends.</span>
          </div>
        )}
        {children}
        {signIn?.provider === p.id && (
          <div className="su-signin" ref={reveal}>
            <div className="su-term"><TerminalView ptyId={signIn.pty} visible focusTick={0} /></div>
            <div className="su-row">
              <span className="hint">Paste with ⌘V; a link opens with ⌘-click. The app never sees what you type.</span>
              <button className="primary" onClick={doneSigningIn}>I have signed in: check again</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
