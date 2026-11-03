import { useEffect, useState } from 'react'
import type { LibraryItem } from '../../shared/library'
import type { Prefs } from '../../shared/types'

const ago = (t: number) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

/** How the voice behaves and what it is told: the microphone mode, how often it speaks up, the time limit, the person's own words, the library items, the talks it remembers. */
export function VoiceTune({ prefs, onChange, project }: { prefs: Prefs; onChange: (patch: Partial<Prefs>) => void; project?: { path: string; name: string } }) {
  const v = prefs.voice
  const set = (patch: Partial<Prefs['voice']>) => onChange({ voice: { ...v, ...patch } })
  const [items, setItems] = useState<LibraryItem[]>([])
  const [talks, setTalks] = useState<{ at: number; summary: string; turns: number }[]>([])
  const [extra, setExtra] = useState(v.extra)
  useEffect(() => void window.aw.library.list().then((l) => setItems(l.items), () => undefined), [])
  useEffect(() => void (project && window.aw.voice.talks(project.path).then(setTalks, () => undefined)), [project?.path]) // eslint-disable-line react-hooks/exhaustive-deps
  const tick = (id: string, on: boolean) => set({ items: on ? [...v.items, id].slice(0, 40) : v.items.filter((x) => x !== id) })
  return (
    <>
      <label>
        Microphone
        <select value={v.mode} onChange={(e) => set({ mode: e.target.value as Prefs['voice']['mode'] })}>
          <option value="ptt">Push to talk: hold the button or Space</option>
          <option value="open">Open microphone: it listens all the time</option>
        </select>
        <span className="hint">Push to talk is the safe start: nothing is heard until you hold the key, so there is no echo from the speakers.</span>
      </label>
      <label>
        Speaks up about the agents
        <select value={v.speak} onChange={(e) => set({ speak: e.target.value as Prefs['voice']['speak'] })}>
          <option value="milestones">When one finishes, needs you or fails</option>
          <option value="chatty">On everything they do</option>
          <option value="silent">Never: it knows, and tells you when you ask</option>
        </select>
        <span className="hint">It waits for a pause and never talks over you.</span>
      </label>
      <label>
        Longest talk
        <select value={v.capMinutes} onChange={(e) => set({ capMinutes: Number(e.target.value) as Prefs['voice']['capMinutes'] })}>
          <option value={15}>15 minutes</option><option value={30}>30 minutes</option><option value={60}>60 minutes</option><option value={0}>No limit</option>
        </select>
        <span className="hint">A warning comes at four fifths of it, and the talk ends at the limit. Time on the line is what Google bills.</span>
      </label>
      <label className="set-sw">
        <span><b>Sounds when a call starts and ends</b><small>A short rising chime when the call connects and a falling one when it ends.</small></span>
        <input type="checkbox" role="switch" checked={v.sounds} onChange={(e) => set({ sounds: e.target.checked })} />
      </label>
      <label className="set-sw">
        <span><b>Ask me before it sends anything</b><small>Off: when you ask the voice to tell an agent something, it sends it at once and says so. On: it shows what it wants to send, and you press Send.</small></span>
        <input type="checkbox" role="switch" checked={v.confirm} onChange={(e) => set({ confirm: e.target.checked })} />
      </label>
      <label>
        Your own words for the voice
        <textarea rows={4} maxLength={2000} value={extra} onChange={(e) => (setExtra(e.target.value), set({ extra: e.target.value }))} placeholder="e.g. Call me Pratik. Keep answers to two sentences. Push back on my ideas." />
      </label>
      <fieldset className="vk-items">
        <legend>Library items the voice is told</legend>
        <span className="hint">Short ones are told whole at the start; longer ones it reads when it asks. Only ticked items are visible to it.</span>
        {items.length === 0 && <span className="hint">The library has nothing yet.</span>}
        {items.map((i) => (
          <label key={i.id} className="vk-item">
            <input type="checkbox" checked={v.items.includes(i.id)} onChange={(e) => tick(i.id, e.target.checked)} />
            <span><b>{i.name}</b><small>{i.description || i.kind}</small></span>
            <span className="vk-chip">{i.tokens.body <= 150 ? 'told whole' : 'read on ask'}</span>
          </label>
        ))}
      </fieldset>
      {project && (
        <fieldset className="vk-items">
          <legend>Talks it remembers in {project.name}</legend>
          {talks.length === 0 && <span className="hint">Nothing yet. After a talk it keeps a short summary and starts the next one from it.</span>}
          {talks.map((t) => (
            <div key={t.at} className="vk-talk">
              <span><b>{ago(t.at)}</b><small>{t.summary}</small></span>
              <button onClick={() => void window.aw.voice.deleteTalk(project.path, t.at).then(() => setTalks((x) => x.filter((y) => y.at !== t.at)))}>Delete</button>
            </div>
          ))}
        </fieldset>
      )}
    </>
  )
}
