import { useCallback, useEffect, useRef, useState } from 'react'
import type { DraftShown, VoiceEvent } from '../../shared/voiceEvent'
import type { VoiceState } from '../../shared/voiceState'
import { startProblem } from '../../shared/voiceKey'
import { holdHint, micAction } from '../../shared/voiceMic'
import { createPlayer, startCapture, type Capture, type Player } from './audioEngine'
import { playChime } from './sounds'

/**
 * The page's side of a talk: the microphone out, the model's speech in, the state, the words of the turn being said, drafts waiting for Send.
 * `level()` is how loud whoever is talking is right now, for the animation to follow without going through React.
 */
export function useVoice(folder: string | undefined, mode: 'ptt' | 'open', activeAgent?: string, sounds = true) {
  const [state, setState] = useState<VoiceState>('idle')
  const [muted, setMuted] = useState(false)
  const [talking, setTalking] = useState(false)
  // Held for two seconds with no sound from the microphone: told on screen, since otherwise the person speaks into nothing.
  const [micSilent, setMicSilent] = useState(false)
  // Hands-free: the microphone stays on, with no key to hold. It starts as the Settings choice says and is turned on and off with a tap on the button.
  const [handsFree, setHandsFreeState] = useState(false)
  const pressedAt = useRef(0)
  const [caps, setCaps] = useState<{ you: string; it: string; last: 'you' | 'it' | null }>({ you: '', it: '', last: null })
  // Speech reaches the page faster than it plays, so the voice is still speaking after Gemini says its turn is over.
  const [playing, setPlaying] = useState(false)
  const [notice, setNotice] = useState('')
  // Why a talk could not start: shown where the person is looking, because there is no dock yet to show it in.
  const [problem, setProblem] = useState<{ text: string; settings: boolean } | null>(null)
  const [drafts, setDrafts] = useState<DraftShown[]>([])
  const hold = useRef({ at: 0, peak: 0 })
  // The chimes: a rising pair the first time a talk is connected, a falling pair when it has ended (whatever ended it).
  const soundsOn = useRef(sounds)
  soundsOn.current = sounds
  const began = useRef(false)
  // The agent open in the app: the voice is told at the start and each time it changes.
  const activeRef = useRef(activeAgent)
  activeRef.current = activeAgent
  const e = useRef<{ cap?: Capture; player?: Player; fresh: 'you' | 'it' | null; talking: boolean; mode: 'ptt' | 'open'; handsFree: boolean; state: VoiceState; noticeT?: ReturnType<typeof setTimeout>; /** A start under way: a second click waits, and a stop while it runs cancels it. */ starting: boolean; cancelled: boolean }>({ starting: false, cancelled: false, fresh: null, talking: false, mode, handsFree: false, state: 'idle' })
  e.current.mode = mode
  e.current.state = state

  const setHands = (on: boolean) => {
    e.current.handsFree = on
    setHandsFreeState(on)
    if (on) hold.current = { at: Date.now(), peak: 0 }
    else setMicSilent(false)
  }
  const say = (text: string) => {
    clearTimeout(e.current.noticeT)
    setNotice(text)
    if (text) e.current.noticeT = setTimeout(() => setNotice(''), 7000)
  }
  const cleanup = useCallback(() => {
    e.current.cancelled = true
    e.current.cap?.stop()
    e.current.player?.close()
    e.current.cap = e.current.player = undefined
    e.current.talking = false
    e.current.handsFree = false
    setTalking(false)
    setHandsFreeState(false)
    setMuted(false)
    setCaps({ you: '', it: '', last: null })
    setPlaying(false)
    setState('idle')
  }, [])

  useEffect(() => {
    const on = (ev: VoiceEvent) => {
      if (ev.type === 'state') (setState(ev.state), setMuted(ev.muted))
      else if (ev.type === 'audio') (setPlaying(true), e.current.player?.play(ev.data))
      else if (ev.type === 'interrupted') e.current.player?.clear()
      else if (ev.type === 'turnComplete') e.current.fresh = null
      else if (ev.type === 'caption') {
        // Each turn starts its line afresh; the fragments of one turn add up.
        const first = e.current.fresh !== ev.who
        e.current.fresh = ev.who
        setCaps((c) => (ev.who === 'you' ? { you: (first ? '' : c.you) + ev.text, it: c.it, last: 'you' } : { ...c, it: (first ? '' : c.it) + ev.text, last: 'it' }))
      } else if (ev.type === 'draft') setDrafts((d) => [...d, ev.draft])
      else if (ev.type === 'draftGone') setDrafts((d) => d.filter((x) => x.id !== ev.id))
      else if (ev.type === 'notice') say(ev.text)
      else if (ev.type === 'error') say(ev.text)
      else if (ev.type === 'ended') (cleanup(), setDrafts([]))
    }
    const off = window.aw.voice.onEvent(on)
    return () => (off(), void window.aw.voice.stop(), e.current.cap?.stop(), e.current.player?.close())
  }, [cleanup])

  const start = useCallback(async () => {
    if (!folder || e.current.state !== 'idle' || e.current.starting) return
    e.current.starting = true
    e.current.cancelled = false
    try {
      await begin(folder)
    } finally {
      e.current.starting = false
    }
  }, [folder])
  const begin = useCallback(async (folder: string) => {
    say('')
    setHands(e.current.mode === 'open')
    setProblem(null)
    // macOS hands an app that was never asked a silent stream and no error, so the microphone is asked for first, before any connection is made.
    if (!(await window.aw.voice.micAccess().catch(() => false))) return setProblem(startProblem('mic'))
    let r: Awaited<ReturnType<typeof window.aw.voice.start>>
    try {
      r = await window.aw.voice.start(folder, activeRef.current)
    } catch (err) {
      return setProblem(startProblem(String((err as Error)?.message ?? err).replace(/^Error invoking remote method '[^']*': (Error: )?/, '')))
    }
    if (!r.ok) return setProblem(startProblem(r.reason))
    if (e.current.cancelled) return void window.aw.voice.stop()
    try {
      e.current.player = createPlayer()
      e.current.player.onIdle = () => setPlaying(false)
      const cap = await startCapture((pcm) => {
        if (e.current.handsFree || e.current.talking) window.aw.voice.audio(pcm)
      })
      // The person ended the call while the microphone was starting.
      if (e.current.cancelled) return cap.stop()
      e.current.cap = cap
      // The button that was clicked to start would otherwise take the Space key as a press.
      ;(document.activeElement as HTMLElement | null)?.blur?.()
    } catch {
      e.current.player?.close()
      e.current.player = undefined
      await window.aw.voice.stop()
      setProblem(startProblem('mic'))
    }
  }, [folder])
  const stop = useCallback(async () => {
    cleanup()
    await window.aw.voice.stop()
  }, [cleanup])

  const pttDown = useCallback(() => {
    if (e.current.talking) return
    e.current.talking = true
    hold.current = { at: Date.now(), peak: 0 }
    setTalking(true)
    // Speaking over the voice cuts it off at once, here and at Gemini.
    e.current.player?.clear()
  }, [])
  const pttUp = useCallback(() => {
    if (!e.current.talking) return
    e.current.talking = false
    setTalking(false)
    setMicSilent(false)
    window.aw.voice.audioEnd()
  }, [])

  useEffect(() => {
    if (!talking && !handsFree) return
    const t = setInterval(() => {
      hold.current.peak = Math.max(hold.current.peak, e.current.cap?.level() ?? 0)
      setMicSilent(holdHint({ heldMs: Date.now() - hold.current.at, peak: hold.current.peak }) === 'silent')
    }, 150)
    return () => clearInterval(t)
  }, [talking, handsFree])

  useEffect(() => {
    // The first time the talk is listening is when it has connected; the states before it may come in one render, so only this one is looked for.
    if (state === 'listening' && !began.current) {
      began.current = true
      if (soundsOn.current) playChime('start')
    } else if (state === 'idle' && began.current) {
      began.current = false
      if (soundsOn.current) playChime('end')
    }
  }, [state])

  useEffect(() => void (state !== 'idle' && activeAgent && window.aw.voice.focus(activeAgent)), [activeAgent, state === 'idle']) // eslint-disable-line react-hooks/exhaustive-deps

  // Space is the push-to-talk key while a talk is on and nothing is being typed.
  useEffect(() => {
    if (state === 'idle' || handsFree) return
    const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
    // Both halves of the key are kept from the page: a button that has the focus would otherwise be pressed when the key comes up.
    const down = (ev: KeyboardEvent) => ev.code === 'Space' && !typing(ev.target) && (ev.preventDefault(), !ev.repeat && pttDown())
    const up = (ev: KeyboardEvent) => ev.code === 'Space' && !typing(ev.target) && (ev.preventDefault(), pttUp())
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => (window.removeEventListener('keydown', down), window.removeEventListener('keyup', up))
  }, [state, handsFree, pttDown, pttUp])

  return {
    // What the orb and words show: speaking until the speech has played out, not only until Gemini has sent it.
    state: state === 'listening' && playing ? ('speaking' as VoiceState) : state,
    muted, talking, handsFree, micSilent, caps, notice, drafts, problem,
    /** The microphone button went down: push to talk begins at once (unless hands-free is on, when the press is only a way to turn it off). */
    micDown: () => {
      pressedAt.current = Date.now()
      if (!e.current.handsFree) pttDown()
    },
    toggleHandsFree: () => setHands(!e.current.handsFree),
    micUp: () => {
      const a = micAction({ handsFree: e.current.handsFree, heldMs: Date.now() - pressedAt.current })
      if (a === 'hands-free-off') return setHands(false)
      pttUp()
      if (a === 'hands-free-on') setHands(true)
    },
    retry: async () => {
      await stop()
      void start()
    },
    dismissProblem: () => setProblem(null),
    start, stop, pttDown, pttUp,
    toggleMute: () => void window.aw.voice.mute(!muted),
    sendDraft: (id: string) => void window.aw.voice.draftSend(id).catch((err) => say(String(err?.message ?? err))),
    discardDraft: (id: string) => void window.aw.voice.draftDiscard(id),
    /** How loud whoever is talking is now: the model while it speaks, the person's microphone while they do. */
    level: () => {
      const out = e.current.player?.level() ?? 0
      return out > 0 || e.current.state === 'speaking' ? out : e.current.handsFree || e.current.talking ? (e.current.cap?.level() ?? 0) : 0
    }
  }
}
