import { useEffect, useRef, useState } from 'react'
import type { VoiceCheck, VoiceKeyState } from '../../shared/types'
import { keyHint, stepsFor } from '../../shared/voiceKey'
import { drawBurst, drawLock, drawMark, drawSpinner, drawStamp, reducedMotion, usePixelCanvas } from './pixelFx'

const STEPS = ['Reaching Google', 'Key accepted', 'Voice models found']
const WHY: Record<Exclude<VoiceCheck, { ok: true }>['reason'], string> = {
  invalid: 'Google did not accept that key. Check it and try again.',
  unreachable: 'Could not reach Google. Check the connection and try again.',
  none: "That key can't use any voice model.",
  nokey: 'No key is saved.'
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function Mark({ kind }: { kind: 'spin' | 'ok' | 'no' | 'wait' }) {
  const ref = usePixelCanvas((ctx, f) => (kind === 'spin' ? drawSpinner(ctx, f) : drawMark(ctx, kind)), kind === 'spin', [kind])
  return <canvas ref={ref} className="vk-mark" width={18} height={18} aria-hidden="true" />
}
function Lock() {
  const ref = usePixelCanvas((ctx) => drawLock(ctx), false)
  return <canvas ref={ref} className="vk-lock" width={24} height={24} aria-hidden="true" />
}
/** The SAVED stamp slamming in, with a burst of pixels. It stands still when the system asks for less motion. */
function Stamp() {
  const ref = usePixelCanvas((ctx, f) => {
    drawStamp(ctx, 260, 84, 'saved', f, reducedMotion())
    if (!reducedMotion()) drawBurst(ctx, 260, 84, f)
  }, true)
  return <canvas ref={ref} className="vk-stamp" width={260} height={84} role="img" aria-label="Saved" />
}

/**
 * Entering the Gemini key: type or paste, press Save and test, and watch the three checks run (reaching Google, the key accepted, the voice
 * models found), a SAVED stamp land, and the card settle to the saved row. A failed check names itself and the field shakes.
 */
export function VoiceKeyCard({ state, onSaved, onRemoved }: { state: VoiceKeyState; onSaved: (models: string[], hint: string) => void; onRemoved: () => void }) {
  const [phase, setPhase] = useState<'edit' | 'testing' | 'passed'>('edit')
  const [replacing, setReplacing] = useState(false)
  const [text, setText] = useState('')
  const [show, setShow] = useState(false)
  const [step, setStep] = useState(0)
  const [failAt, setFailAt] = useState(-1)
  const [found, setFound] = useState(0)
  const [why, setWhy] = useState('')
  const [shake, setShake] = useState(0)
  const alive = useRef(true)
  useEffect(() => () => void (alive.current = false), [])

  const run = async () => {
    setPhase('testing'); setStep(0); setFailAt(-1); setWhy('')
    const t0 = Date.now()
    const key = text
    const res = await window.aw.voice.saveKey(key).catch((): VoiceCheck => ({ ok: false, reason: 'unreachable' }))
    const { failAt: bad, found: n } = stepsFor(res)
    const quick = reducedMotion()
    for (let i = 0; i < 3; i++) {
      // The first check lasts as long as Google takes to answer, but at least long enough to be seen.
      await sleep(quick ? 0 : Math.max(0, 450 - (i === 0 ? Date.now() - t0 : 0)))
      if (!alive.current) return
      if (bad === i) {
        setFailAt(i); setWhy(res.ok ? '' : WHY[res.reason]); setShake((s) => s + 1); setPhase('edit')
        return
      }
      setStep(i + 1)
    }
    setFound(n); setPhase('passed')
    if (res.ok) onSaved(res.models, keyHint(key.trim()))
    setText(''); setReplacing(false)
    await sleep(quick ? 400 : 1800)
    if (alive.current) setPhase('edit')
  }

  const saved = state.set && !replacing && phase === 'edit'
  if (saved) {
    return (
      <div className="vk-saved" data-testid="voice-key-saved">
        <Lock />
        <span className="vk-hint" aria-label={`Gemini key ${state.hint}`}>{state.hint || 'Gemini key'}</span>
        {found > 0 && <span className="vk-chip">{found} models</span>}
        <span className="vk-sp" />
        <button onClick={() => { setReplacing(true); setFailAt(-1); setWhy('') }}>Replace</button>
        <button onClick={() => { void window.aw.voice.clearKey().then(onRemoved); setFound(0) }}>Remove</button>
      </div>
    )
  }
  const testing = phase === 'testing', passed = phase === 'passed'
  const showSteps = testing || passed || failAt >= 0
  return (
    <div className="vk">
      {passed ? <div className="vk-stampwrap"><Stamp /></div> : (
        <label className="set-path">
          Gemini API key
          <span className="vk-in">
            <input key={shake} className={`${failAt >= 0 ? 'bad' : ''}${shake ? ' shake' : ''}`} type={show ? 'text' : 'password'} autoComplete="off" spellCheck={false} value={text} disabled={!state.available || testing}
              placeholder="Paste the key from Google AI Studio" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && text.trim() && !testing && void run()} />
            <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide the key' : 'Show the key'}>{show ? 'Hide' : 'Show'}</button>
          </span>
          <span className="hint">Kept encrypted by your system's keychain, never shown again. Get one at aistudio.google.com.</span>
        </label>
      )}
      {showSteps && (
        <ol className="vk-steps" aria-label="Checking the key">
          {STEPS.map((s, i) => {
            const bad = failAt === i, done = i < step && !bad, now = testing && i === step
            return (
              <li key={s} className={bad ? 'no' : done ? 'ok' : now ? 'on' : ''}>
                <Mark kind={bad ? 'no' : done ? 'ok' : now ? 'spin' : 'wait'} />
                <span>{s}</span>
                <small>{done && i === 2 ? `${found || ''} found`.trim() : done ? 'ok' : ''}</small>
              </li>
            )
          })}
        </ol>
      )}
      {why && <p className="set-note bad" role="alert">{why}</p>}
      {!passed && (
        <div className="set-row">
          <button className="primary" onClick={() => void run()} disabled={!text.trim() || !state.available || testing}>{testing ? 'Checking with Google…' : failAt >= 0 ? 'Try again' : 'Save and test'}</button>
          {replacing && !testing && <button onClick={() => { setReplacing(false); setText(''); setFailAt(-1); setWhy('') }}>Cancel</button>}
        </div>
      )}
    </div>
  )
}

