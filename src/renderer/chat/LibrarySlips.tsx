import { useEffect, useState } from 'react'
import type { LibraryItem, Use } from '../../shared/library'
import { PixelIcon, type IconName } from './PixelIcon'
import type { Slip } from './slips'

/** What the library did for an agent, and the items it knows by name, kept fresh as the agent works. */
export function useLibraryUses(agentId: string): { uses: Use[]; items: Map<string, LibraryItem> } {
  const [uses, setUses] = useState<Use[]>([])
  const [items, setItems] = useState<Map<string, LibraryItem>>(new Map())
  useEffect(() => {
    let alive = true
    const load = () => void window.aw.library.uses(agentId).then((u) => alive && setUses(u), () => undefined)
    load()
    void window.aw.library.list().then((r) => alive && setItems(new Map(r.items.map((i) => [i.id, i]))), () => undefined)
    const off = window.aw.onLibraryUse((id) => id === agentId && load())
    return () => {
      alive = false
      off()
    }
  }, [agentId])
  return { uses, items }
}

const gap = (ms: number) => (ms < 950 ? 'at once' : ms < 60_000 ? `${(ms / 1000).toFixed(1)}s later` : `${Math.round(ms / 60_000)} min later`)
const tokens = (s: string) => Math.max(1, Math.ceil(s.length / 4))

const why = (s: { because?: string }) => (s.because ? `pointed because of a ${s.because}` : 'pointed')
interface Note { key: string; icon: IconName; tone: 'told' | 'read' | 'point' | 'mute'; title: string; says: string; words?: string; description?: string }

function notes(slips: Slip[], starts: Use[], told: number, items: Map<string, LibraryItem>): Note[] {
  const out: Note[] = starts.map((s) => ({ key: `start-${s.t}`, icon: 'flag', tone: 'told', title: 'Told at the start', says: told ? `${told} ${told === 1 ? 'item' : 'items'} every time, the rest pointed out as you go` : 'the opening text', words: s.words }))
  for (const s of slips) {
    const it = items.get(s.id)
    const title = it?.name ?? s.id
    out.push(
      s.state === 'read'
        ? { key: s.id, icon: 'book', tone: 'read', title, says: `${why(s)}, then read · ${gap(s.gapMs ?? 0)}`, words: s.words, description: it?.description }
        : s.state === 'pointed'
          ? { key: s.id, icon: 'tag', tone: 'mute', title, says: `${why(s)}, not read`, words: s.words, description: it?.description }
          : { key: s.id, icon: 'book', tone: 'point', title, says: 'read on its own, not pointed at', description: it?.description }
    )
  }
  return out
}

/** Slips beside a message: one per library item or opening text. A slip opens to the exact words the agent was given. */
export function LibrarySlips({ slips, starts, told, items }: { slips: Slip[]; starts: Use[]; told: number; items: Map<string, LibraryItem> }) {
  const [open, setOpen] = useState<string | null>(null)
  const list = notes(slips, starts, told, items)
  if (!list.length) return null
  return (
    <div className="slips" aria-label="What the library did here">
      {list.map((n) => (
        <div key={n.key} className="slip-wrap">
          <button className={`slip ${n.tone}${open === n.key ? ' open' : ''}`} aria-expanded={open === n.key} onClick={() => setOpen(open === n.key ? null : n.key)}>
            <span className="slip-h"><span className={`slip-ic ${n.tone}`}><PixelIcon name={n.icon} scale={2} /></span>{n.title}</span>
            <span className="slip-q">{n.says}</span>
          </button>
          {open === n.key && (
            <div className="paper" role="group" aria-label={`${n.title}, the words`}>
              <p className="paper-w">{n.words ?? n.description ?? ''}</p>
              <p className="paper-f">{n.words ? `about ${tokens(n.words)} tokens, as the agent was given them` : 'No words were sent: the agent reached for it itself.'}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
