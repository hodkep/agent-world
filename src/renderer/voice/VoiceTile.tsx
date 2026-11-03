import type { DraftShown } from '../../shared/voiceEvent'
import type { VoiceState } from '../../shared/voiceState'
import { VoiceOrb } from './VoiceOrb'

export interface VoiceView {
  state: VoiceState
  talking: boolean
  handsFree: boolean
  micSilent: boolean
  caps: { you: string; it: string; last: 'you' | 'it' | null }
  notice: string
  drafts: DraftShown[]
  level: () => number
  micDown(): void
  micUp(): void
  toggleHandsFree(): void
  stop(): void
  retry(): void
  sendDraft(id: string): void
  discardDraft(id: string): void
}

// Plain outline icons on the app's 24 grid: square ends, 2px strokes.
const Svg = ({ children }: { children: React.ReactNode }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">{children}</svg>
)
// With a slash through it the microphone is off; plain, it is on and the voice can hear.
const MicIcon = ({ off }: { off: boolean }) => (
  <Svg>
    <rect x="9" y="3" width="6" height="11" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" />
    {off && <path className="vcall-slash" d="M3 3l18 18" />}
  </Svg>
)
// A telephone handset laid on its back: dropping the call.
const HangUpIcon = () => <Svg><path d="M2 15c5-5 15-5 20 0v4h-6v-3c-2-1-6-1-8 0v3H2z" /></Svg>

/**
 * The voice companion as a call tile, like a person in a meeting: the agent in the top-right corner and two icon buttons under it, the microphone
 * and the end of the call. No panel and no text: the orb says what it is doing. Only something that needs reading (a draft waiting for Send, a
 * connection that failed, a microphone that gives no sound) appears under it, and only while it does.
 */
export function VoiceTile({ v, layout }: { v: VoiceView; layout: 'corner' | 'strip' }) {
  const on = v.handsFree || v.talking
  const you = v.caps.you ? `“${v.caps.you}”` : ''
  // What a screen reader is told; the tile itself shows none of it.
  const caption = v.state === 'thinking' ? `${you} Thinking…` : v.caps.last === 'it' && v.caps.it ? v.caps.it : you
  const warning = v.state === 'error' ? v.notice || 'The connection was lost.' : on && v.micSilent ? 'I cannot hear anything from your microphone. Check the input in System Settings > Sound.' : v.notice
  const strip = layout === 'strip'
  return (
    <section className={`vcall ${layout}`} role="region" aria-label="Voice companion" data-state={v.state} data-mic={v.handsFree ? 'hands-free' : v.talking ? 'push' : 'off'}>
      <div className="vcall-tile">
        <VoiceOrb look={v.state} getLevel={v.level} cells={strip ? 16 : 24} px={strip ? 3 : 4} />
        <p className="sr-only vp-cap" aria-live="polite">{caption}</p>
        <div className="vcall-btns">
          <button
            className={`vcall-btn vcall-mic${v.handsFree ? ' on' : ''}${v.talking ? ' hold' : ''}`}
            aria-label={on ? 'Microphone is on: tap to turn it off' : 'Microphone is off: hold to talk, or tap to turn it on'}
            aria-pressed={on}
            title={on ? 'Microphone on · tap to turn it off' : 'Microphone off · hold to talk (or Space) · tap to turn it on'}
            disabled={v.state === 'connecting'}
            onPointerDown={(e) => (e.currentTarget.setPointerCapture(e.pointerId), v.micDown())}
            onPointerUp={v.micUp}
            onPointerCancel={v.micUp}
            // From the keyboard (Enter) there is no hold: it turns hands-free on or off. A click that follows a pointer press is already handled above.
            onClick={(e) => e.detail === 0 && v.toggleHandsFree()}
          >
            <MicIcon off={!on} />
          </button>
          <button className="vcall-btn vcall-end" aria-label="End the call" title="End the call" onClick={v.stop}><HangUpIcon /></button>
        </div>
      </div>
      {warning && (
        <div className="vcall-bubble" role={v.state === 'error' ? 'alert' : 'status'}>
          <p>{warning}</p>
          {v.state === 'error' && <button onClick={v.retry}>Try again</button>}
        </div>
      )}
      {v.drafts.map((d) => (
        <div key={d.id} className="vcall-bubble vcall-draft" role="group" aria-label="Draft from the voice companion">
          <b>{d.kind === 'message' ? `DRAFT FOR ${(d.to ?? '').toUpperCase()}` : 'DRAFT TODO'}</b>
          <p>{d.kind === 'todo' ? [d.title, d.text].filter(Boolean).join(': ') : d.text}</p>
          <div className="vcall-row">
            <button className="primary" onClick={() => v.sendDraft(d.id)}>{d.kind === 'message' ? 'Send' : 'Add'}</button>
            <button onClick={() => v.discardDraft(d.id)}>Discard</button>
          </div>
        </div>
      ))}
    </section>
  )
}
