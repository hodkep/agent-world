import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { RemoteState } from '../../shared/types'
import { qrMatrix } from '../../shared/qr'
import { Modal } from '../panel/Modal'
import { OutlineIcon } from '../panel/IconButton'
import { REMOTE_EVENT, type RemoteAction } from './remoteCommands'

/** An icon-only button like the top bar's: its name is the tooltip and the accessible name. */
function Tip({ icon, label, tip, onClick }: { icon: Parameters<typeof OutlineIcon>[0]['name']; label: string; tip?: string; onClick: () => void }) {
  return (
    <button className="tip-btn" aria-label={label} data-tip={tip ?? label} onClick={onClick}>
      <OutlineIcon name={icon} />
    </button>
  )
}

const Phone = () => (
  <svg width="9" height="13" viewBox="0 0 9 13" aria-hidden="true" shapeRendering="crispEdges">
    <path fill="currentColor" fillRule="evenodd" d="M1 0h7v1h1v11h-1v1H1v-1H0V1h1V0Zm1 2v7h5V2H2Zm2 8h1v1H4v-1Z" />
  </svg>
)

const WORDS = { starting: 'Starting', on: 'Remote', unavailable: 'Not available' } as const

/** The agent's remote state as a tag; a button when there is something to open. */
export function RemoteTag({ state, onClick }: { state: Exclude<RemoteState, { state: 'off' }>; onClick?: () => void }) {
  const inner = (
    <>
      {state.state !== 'unavailable' && <Phone />}
      {WORDS[state.state]}
    </>
  )
  const title = state.state === 'unavailable' ? state.reason : state.state === 'starting' ? 'Waiting for the link' : 'Continue this agent from your phone'
  return onClick ? (
    <button className={`rtag ${state.state}`} aria-haspopup="menu" title={title} onClick={onClick}>{inner}</button>
  ) : (
    <span className={`rtag ${state.state}`} title={title}>{inner}</span>
  )
}

/** The link as a code to point a phone at. */
export function QrCode({ text }: { text: string }) {
  const m = useMemo(() => qrMatrix(text), [text])
  const q = 2
  const n = m.length + 2 * q
  const d = m.flatMap((row, y) => row.map((on, x) => (on ? `M${x + q} ${y + q}h1v1h-1z` : ''))).join('')
  return (
    <svg className="qr" width={n * 4} height={n * 4} viewBox={`0 0 ${n} ${n}`} role="img" aria-label="Code to open this agent on a phone" shapeRendering="crispEdges">
      <rect width={n} height={n} fill="#e4e4ee" />
      <path d={d} fill="#08070c" />
    </svg>
  )
}

/** What opens from the tag: the code, then copy, open and turn off as icon buttons. */
export function RemotePanel({ agentName, link, onCopy, onOff }: { agentName: string; link: string; onCopy: () => void; onOff: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  // The column clips what sticks out of it: shift left by what crosses its right edge, never past its left edge.
  useLayoutEffect(() => {
    const el = box.current
    const col = el?.closest('aside')?.getBoundingClientRect()
    if (!el || !col) return
    const r = el.getBoundingClientRect()
    const over = r.right - (col.right - 8)
    if (over > 0) el.style.left = `${-Math.min(over, r.left - col.left - 8)}px`
  }, [])
  return (
    <div className="pop-menu remote-panel" ref={box} role="menu" aria-label={`Remote control for ${agentName}`}>
      <div className="menu-label">Remote control · {agentName}</div>
      <div className="remote-qr">
        <QrCode text={link} />
        <span>Point the phone camera here, or copy the link.</span>
      </div>
      <div className="remote-acts">
        <Tip icon="copy" label="Copy phone link" onClick={onCopy} />
        <Tip icon="external" label="Open in browser" onClick={() => void window.aw.openExternal(link)} />
        <span className="grow" />
        <Tip icon="power" label="Turn off remote control" onClick={onOff} />
      </div>
    </div>
  )
}

/** The menu rows: one that shows the state and switches it, and, once there is a link, copy, code and off. */
export function RemoteRows({ state, onToggle, onCopy, onQr, close }: { state: RemoteState; onToggle: () => void; onCopy: () => void; onQr: () => void; close: () => void }) {
  const run = (f: () => void) => () => (close(), f())
  return (
    <>
      <div className="menu-sep" />
      <button role="menuitem" className="remote-row" onClick={run(onToggle)} title={state.state === 'unavailable' ? state.reason : state.state === 'off' ? 'Continue this agent from your phone' : 'Turn remote control off'}>
        <span className="l"><OutlineIcon name="phone" size={14} />Remote control</span>
        {state.state === 'off' ? <span className="rtag off">Off</span> : <RemoteTag state={state} />}
      </button>
      {state.state === 'unavailable' && <div className="menu-why">{state.reason}</div>}
      {state.state === 'on' && (
        <>
          <button role="menuitem" onClick={run(onCopy)}><span className="l"><OutlineIcon name="copy" size={14} />Copy phone link</span></button>
          <button role="menuitem" onClick={run(onQr)}><span className="l"><OutlineIcon name="qr" size={14} />Show QR code</span></button>
          <button role="menuitem" onClick={run(onToggle)}><span className="l"><OutlineIcon name="power" size={14} />Turn off remote control</span></button>
        </>
      )}
      <div className="menu-sep" />
    </>
  )
}

/** Says what switching costs before it restarts the agent: two icon buttons, cancel and go. */
export function RemoteConfirm({ agentName, turnOn, working, onAnswer }: { agentName: string; turnOn: boolean; working: boolean; onAnswer: (yes: boolean) => void }) {
  const what = turnOn ? 'on' : 'off'
  return (
    <Modal label={`Turn ${what} remote control for ${agentName}?`} className="confirm-dialog remote-confirm" onClose={() => onAnswer(false)}>
      <div className="cf-body">
        <b>Turn {what} remote control for {agentName}?</b>
        <p>{working ? `${agentName} restarts on the same session to ${turnOn ? 'take the phone link' : 'let go of it'}. A turn in progress ends, and ${agentName} starts again where it was.` : `${agentName} is idle. It restarts on the same session now, and nothing is lost.`}</p>
        <div className="su-row">
          <button autoFocus onClick={() => onAnswer(false)}>Cancel</button>
          <button className="primary" onClick={() => onAnswer(true)}>{working ? `Restart and turn ${what}` : `Turn ${what}`}</button>
        </div>
      </div>
    </Modal>
  )
}

/** The agent's remote state, in its name row beside its status: the tag, the phone panel it opens, and the confirm before a switch (the menu and the palette ask it by event). */
export function RemoteHead({ agentId, agentName, working, remote }: { agentId: string; agentName: string; working: boolean; remote: RemoteState }) {
  const [panel, setPanel] = useState(false)
  const [ask, setAsk] = useState<boolean | null>(null)
  const [note, setNote] = useState('')
  const link = remote.state === 'on' ? remote.link : ''
  useEffect(() => {
    if (!link) setPanel(false)
  }, [link])
  const flash = (text: string) => (setNote(text), setTimeout(() => setNote(''), 2500))
  const copy = () => void navigator.clipboard.writeText(link).then(() => (setPanel(false), flash('Link copied')))
  const toggle = () => setAsk(remote.state === 'off')
  // A click anywhere outside the tag and its panel, or Esc, closes the panel.
  const wrap = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!panel) return
    const away = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setPanel(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), setPanel(false))
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', esc, true)
    return () => {
      window.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', esc, true)
    }
  }, [panel])
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ agentId: string; action: RemoteAction }>).detail
      if (d.agentId !== agentId) return
      if (d.action === 'on' || d.action === 'off') setAsk(d.action === 'on')
      else if (d.action === 'qr') setPanel(true)
      else copy()
    }
    window.addEventListener(REMOTE_EVENT, on)
    return () => window.removeEventListener(REMOTE_EVENT, on)
  })
  if (remote.state === 'off' && ask === null) return null
  return (
    <span className="remote-head menu-wrap" ref={wrap}>
      {remote.state !== 'off' && <RemoteTag state={remote} onClick={link ? () => setPanel((o) => !o) : toggle} />}
      {note && <span className="chat-note" role="status">{note}</span>}
      {panel && link && <RemotePanel agentName={agentName} link={link} onCopy={copy} onOff={() => (setPanel(false), toggle())} />}
      {ask !== null && <RemoteConfirm agentName={agentName} turnOn={ask} working={working} onAnswer={(yes) => (setAsk(null), yes && void window.aw.setRemote(agentId, ask).catch((e: Error) => flash(e.message)))} />}
    </span>
  )
}
