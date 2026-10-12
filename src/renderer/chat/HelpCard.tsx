import { useMemo, useState } from 'react'
import type { PaletteCommand } from '../../shared/commands'

const SOURCES: PaletteCommand['source'][] = ['built-in', 'project command', 'project skill', 'your command', 'your skill', 'plugin command', 'plugin skill']

/**
 * What /help shows in the chat: every command and skill this agent has, by where it comes from, with a filter. Claude's own /help is a screen of
 * its terminal that leaves nothing in the conversation, so the chat answers it itself instead of leaving a message that quietly disappears.
 */
export function HelpCard({ commands, onPick, onClose }: { commands: PaletteCommand[]; onPick: (name: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const groups = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    const shown = commands.filter((c) => words.every((w) => `${c.name} ${c.description}`.toLowerCase().includes(w)))
    return SOURCES.map((s) => ({ source: s, list: shown.filter((c) => c.source === s) })).filter((g) => g.list.length)
  }, [commands, q])
  return (
    <section className="help-card" role="region" aria-label="Commands">
      <header>
        <b>Commands</b>
        <small>Type / in the box to find one as you write. Click one to put it in the box.</small>
        <button onClick={onClose} aria-label="Close help">×</button>
      </header>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter commands…" aria-label="Filter commands" />
      <div className="help-body">
        {groups.length === 0 && <p className="hint">Nothing matches.</p>}
        {groups.map((g) => (
          <div key={g.source}>
            <h4>{g.source}</h4>
            <ul>
              {g.list.map((c) => (
                <li key={`${g.source}${c.name}`}>
                  <button onClick={() => onPick(c.name)}><code>/{c.name}</code><span>{c.description}</span></button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
