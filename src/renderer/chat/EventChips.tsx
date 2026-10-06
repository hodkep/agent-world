import { useState } from 'react'
import type { NoteEvent } from '../../shared/chat'
import type { NoteRow } from './format'

const KIND: Record<NoteEvent, { glyph: string; label: string }> = {
  monitor: { glyph: '◉', label: 'Monitor' },
  interrupted: { glyph: '■', label: 'Interrupted' },
  failed: { glyph: '✕', label: 'Task failed' },
  command: { glyph: '⌘', label: 'Command' },
  compact: { glyph: '⇲', label: 'Compacted' },
  hook: { glyph: '⚑', label: 'Hook' }
}
const BAD = /error|fail|refused|timeout|exception/i
const GOOD = /^(done|ok|ready|up|started|success)\b|\b200 OK\b|\b(is|are|now) up\b|\bup on\b/i
/** How a line a monitor printed reads: trouble, good news, or routine. */
const toneOf = (line: string) => (BAD.test(line) ? 'bad' : GOOD.test(line.trim()) ? 'ok' : '')
const clock = (at: number | undefined) => (at ? new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '')
const firstLine = (t: string) => t.split('\n')[0] ?? ''

/** What opens under a chip: a monitor's every line with its time, or the longer text the event carried. */
function body(c: NoteRow): { time: string; text: string; tone?: string }[] | string | null {
  if (c.lines && c.lines.some((l) => l.text) && (c.lines.length > 1 || c.lines[0]!.text.includes('\n'))) return c.lines.map((l) => ({ time: clock(l.at), text: l.text, tone: toneOf(l.text) }))
  return !c.lines && c.detail ? c.detail : null
}

function Chip({ chip, open, onToggle }: { chip: NoteRow; open: boolean; onToggle: () => void }) {
  const kind = KIND[chip.event ?? 'command']
  const last = chip.lines?.at(-1)?.text
  const tone = chip.tone === 'bad' || chip.event === 'failed' ? 'bad' : ''
  const count = chip.lines && chip.lines.length > 1 ? chip.lines.length : 0
  const opens = body(chip) !== null
  const inner = (
    <>
      <span className="ev-g" aria-hidden="true">{kind.glyph}</span>
      <span className="ev-w">
        {chip.text}
        {last && (
          <>
            <span className="ev-sep"> · </span>
            <span className={`ev-last ${toneOf(firstLine(last))}`}>{firstLine(last)}</span>
          </>
        )}
      </span>
      {count > 0 && <span className="ev-n" aria-label={`${count} times`}>{count}×</span>}
    </>
  )
  const label = `${kind.label}: ${chip.text}${last ? `, ${firstLine(last)}` : ''}`
  return opens ? (
    <button className={`ev-chip ${tone} ${open ? 'open' : ''}`} aria-expanded={open} aria-label={label} onClick={onToggle}>
      {inner}
    </button>
  ) : (
    <span className={`ev-chip plain ${tone}`} role="note" aria-label={label}>
      {inner}
    </span>
  )
}

/** System events that came one after another (a Monitor firing, an interrupt, a failed task, a command's output, a compaction, a hook), as small chips; one opens to what it printed. */
export function EventChips({ chips }: { chips: NoteRow[] }) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle = (id: string) => setOpen((o) => (o.has(id) ? new Set([...o].filter((x) => x !== id)) : new Set(o).add(id)))
  return (
    <div className="msg events">
      <div className="ev-chips">
        {chips.map((c) => (
          <Chip key={c.id} chip={c} open={open.has(c.id)} onToggle={() => toggle(c.id)} />
        ))}
      </div>
      {chips.filter((c) => open.has(c.id)).map((c) => {
        const b = body(c)
        const kind = KIND[c.event ?? 'command']
        return (
          <div key={c.id} className={`ev-drawer ${c.tone === 'bad' || c.event === 'failed' ? 'bad' : ''}`}>
            <div className="ev-head">
              <span className="ev-lbl">{kind.label}</span>
              {c.at ? <span> · {clock(c.at)}</span> : null}
            </div>
            {Array.isArray(b) ? (
              <div className="ev-body">
                {b.map((l, i) => (
                  <div key={i} className={`ev-line ${l.tone}`}>
                    <time>{l.time}</time>
                    <span>{l.text}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="ev-body ev-text">{b}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}
