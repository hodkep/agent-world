import { useState } from 'react'
import { PLACES, type Place, findShortcuts, isMac, showKey } from '../shortcuts'
import { Modal } from './Modal'

/** Every shortcut the app has, grouped by where it works; type to narrow by words or keys, or pick a place. */
export function ShortcutsSheet({ onClose }: { onClose: () => void }) {
  const mac = isMac()
  const [query, setQuery] = useState('')
  const [place, setPlace] = useState<Place | null>(null)
  const shown = findShortcuts(query, place, mac)
  const groups = PLACES.map((p) => [p, shown.filter((s) => s.place === p)] as const).filter(([, list]) => list.length > 0)
  return (
    <Modal label="Keyboard shortcuts" className="shortcuts" onClose={onClose}>
      <div className="settings-head">
        <b>Keyboard shortcuts</b>
        <button onClick={onClose}>Close</button>
      </div>
      <div className="sc-find">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a shortcut…" aria-label="Find a shortcut" autoFocus />
        <div className="sc-chips" role="group" aria-label="Where it works">
          {[null, ...PLACES].map((p) => (
            <button key={p ?? 'all'} className="sc-chip" aria-pressed={place === p} onClick={() => setPlace(p)}>
              {p ?? 'All'}
            </button>
          ))}
        </div>
      </div>
      <div className="sc-body">
        {groups.length === 0 && <p className="sc-empty">No shortcut matches.</p>}
        {groups.map(([p, list]) => (
          <section key={p} className="sc-group" aria-label={p}>
            <h3>{p}</h3>
            {list.map((s) => (
              <div key={s.id} className="sc-row">
                <span>{s.text}</span>
                {s.keys.map((k) => (
                  <kbd key={k}>{showKey(k, mac)}</kbd>
                ))}
              </div>
            ))}
          </section>
        ))}
      </div>
    </Modal>
  )
}
