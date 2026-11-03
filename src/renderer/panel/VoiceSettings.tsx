import { useEffect, useState } from 'react'
import type { Prefs, VoiceKeyState } from '../../shared/types'
import { micChip, modelLabel } from '../../shared/voiceKey'
import { VoiceKeyCard } from '../voice/VoiceKeyCard'
import { VoiceTune } from '../voice/VoiceTune'

const DEFAULT_MODEL = 'gemini-3.8-live'

/** The voice companion's setup: the Gemini key (kept in the system keychain, tested with Google when saved), the model, and the switch. */
export function VoiceSettings({ prefs, onChange, project }: { prefs: Prefs; onChange: (patch: Partial<Prefs>) => void; project?: { path: string; name: string } }) {
  const [state, setState] = useState<VoiceKeyState | null>(null)
  // null until Google has answered, so the saved model is not called unavailable while the list is still on its way.
  const [models, setModels] = useState<string[] | null>(null)
  const [mic, setMic] = useState('unknown')
  const [says, setSays] = useState('')
  const { enabled, model } = prefs.voice
  const set = (patch: Partial<Prefs['voice']>) => onChange({ voice: { ...prefs.voice, ...patch } })

  // Asking again each time the pane opens also shows a key Google has since turned off.
  useEffect(() => {
    void window.aw.voice.micStatus().then(setMic, () => undefined)
    void window.aw.voice.keyState().then(async (s) => {
      setState(s)
      if (!s.set) return setModels([])
      const r = await window.aw.voice.models()
      if (r.ok) setModels(r.models)
      else (setModels([]), setSays(r.reason === 'invalid' ? 'Google no longer accepts the saved key. Replace it.' : r.reason === 'unreachable' ? 'Could not reach Google to check the key.' : ''))
    })
  }, [])

  const turnOn = async (on: boolean) => {
    if (!on) return set({ enabled: false })
    // The system asks for the microphone the first time; turning voice on is the moment to ask, not mid-talk.
    const ok = await window.aw.voice.micAccess()
    setMic(await window.aw.voice.micStatus())
    if (ok) return (setSays(''), set({ enabled: true }))
    setSays('The microphone is blocked. Allow Agent World under System Settings > Privacy & Security > Microphone, then try again.')
  }

  if (!state) return null
  const known = models ?? []
  // A model Google no longer lists for this key stays selectable so the choice is not lost silently, marked as unavailable.
  const gone = state.set && models !== null && models.length > 0 && !known.includes(model)
  const options = models === null || known.includes(model) || !state.set ? known : [model, ...known]
  const shown = options.length ? options : [model]
  const chip = micChip(mic)
  return (
    <>
      <legend>Voice (beta)</legend>
      <p className="set-lead">A voice companion to talk ideas through beside the chat. It uses your own Gemini key, so Google bills you directly, roughly 1 to 2 cents for each minute you talk (an estimate).</p>
      {!state.available && <p className="set-note bad" role="alert">This computer's keychain is not available, so a key can't be kept safely and voice can't be set up.</p>}
      <VoiceKeyCard
        state={state}
        onSaved={(list, hint) => {
          setModels(list)
          setState({ set: true, available: true, hint })
          setSays('')
          if (!list.includes(model)) set({ model: list[0]! })
        }}
        onRemoved={() => {
          setState((s) => s && { ...s, set: false, hint: '' })
          setModels([])
          setSays('')
          if (enabled) set({ enabled: false })
        }}
      />
      <div className="vk-models" role="radiogroup" aria-label="Voice model">
        <span className="vk-label">Voice model</span>
        {shown.map((m) => {
          const l = modelLabel(m, DEFAULT_MODEL)
          const off = gone && m === model
          return (
            <button key={m} role="radio" aria-checked={m === model} disabled={!state.set} className="vk-model" onClick={() => set({ model: m })}>
              <i aria-hidden="true" />
              <span><b>{m}</b><small>{off ? 'Not available for this key any more.' : l.note}</small></span>
              {l.tag && <span className="vk-chip">{l.tag}</span>}
            </button>
          )
        })}
        <small className="vk-fine">Google retires preview models now and then: when yours goes, pick the next one here.</small>
      </div>
      {says && <p className="set-note bad" role="alert">{says}</p>}
      <label className={`set-sw${state.set ? '' : ' off'}`}>
        <span><b>Voice companion</b><small>{state.set ? 'Asks the system for the microphone when you turn it on.' : 'Save a key first.'} <span className={`vk-mic ${chip.tone}`}><i aria-hidden="true" />{chip.text}</span></small></span>
        <input type="checkbox" role="switch" checked={enabled && state.set} disabled={!state.set} onChange={(e) => void turnOn(e.target.checked)} />
      </label>
      {state.set && <VoiceTune prefs={prefs} onChange={onChange} project={project} />}
    </>
  )
}
