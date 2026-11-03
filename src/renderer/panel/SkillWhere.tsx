import { useLayoutEffect, useRef, useState } from 'react'
import type { SkillPlaces } from '../../shared/library'
import { PixelIcon } from '../chat/PixelIcon'

type State = 'on' | 'off' | 'copy' | 'none'
const WORD: Record<State, string> = { on: 'linked', off: 'plug in', copy: 'a copy', none: 'not here' }

/**
 * Where one skill works, as a patch panel: the one library copy on the left, a socket for each place on the right, and a cable to each place it reaches.
 * Every socket is a switch: Claude in the app is on or off; any other place is a link to the library copy, never a copy of its own.
 */
export function SkillWhere({ id, colour, dir, places, onClaude, onLink, busy }: { id: string; colour: string; dir: string; places: SkillPlaces; onClaude: (on: boolean) => void; onLink: (target: string, on: boolean) => void; busy: boolean }) {
  const states = places.states[id] ?? {}
  const rows: { key: string; label: string; sub: string; state: State; aria: string; toggle?: () => void }[] = [
    { key: 'claude-app', label: 'Claude in the app', sub: 'every account, automatic at each start', state: places.claudeOff.includes(id) ? 'off' : 'on', aria: 'On for every Claude account in the app', toggle: () => onClaude(places.claudeOff.includes(id)) },
    ...places.targets.map((t) => {
      const st = states[t.id] ?? 'none'
      const state: State = st === 'copy' ? 'copy' : st === 'linked' ? 'on' : t.present ? 'off' : 'none'
      return { key: t.id, label: t.label, sub: state === 'copy' ? `${t.dir} · a copy of its own is there, left as it is` : state === 'none' ? 'not installed on this computer' : t.dir, state, aria: `Linked into ${t.label}`, toggle: state === 'on' || state === 'off' ? () => onLink(t.id, state === 'off') : undefined }
    })
  ]
  const box = useRef<HTMLDivElement>(null)
  const [wires, setWires] = useState<{ y0: number; ys: number[]; h: number }>({ y0: 0, ys: [], h: 0 })
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => {
      const cab = el.querySelector('.skw-cables')!.getBoundingClientRect()
      const lib = el.querySelector('.skw-lib')!.getBoundingClientRect()
      const ys = [...el.querySelectorAll('.skw-sock')].map((s) => { const r = s.getBoundingClientRect(); return r.top + r.height / 2 - cab.top })
      setWires({ y0: lib.top + lib.height / 2 - cab.top, ys, h: cab.height })
    }
    measure()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [rows.length])
  return (
    <div className="lip-panel skw" role="tabpanel" aria-label="Where it works" ref={box}>
      <div className="skw-lib" style={{ '--sk': colour } as React.CSSProperties}>
        <span className="skw-book" aria-hidden><PixelIcon name="book" scale={3} /></span>
        <b>Library copy</b>
        <small title={dir}>{dir}</small>
      </div>
      <svg className="skw-cables" aria-hidden height={wires.h} viewBox={`0 0 80 ${wires.h || 1}`} preserveAspectRatio="none">
        {rows.map((r, i) => wires.ys[i] !== undefined && <path key={r.key} className={`skw-wire ${r.state}`} d={`M0 ${wires.y0} C40 ${wires.y0} 40 ${wires.ys[i]} 80 ${wires.ys[i]}`} />)}
      </svg>
      <div className="skw-socks">
        {rows.map((r) => (
          <button key={r.key} className={`skw-sock ${r.state}`} role="switch" aria-checked={r.state === 'on'} aria-label={r.aria} disabled={busy || !r.toggle} title={r.state === 'off' ? `Link it into ${r.label}` : r.state === 'on' ? (r.key === 'claude-app' ? 'Turn it off for Claude' : `Take the link out of ${r.label}`) : undefined} onClick={r.toggle}>
            <span className="skw-jack" aria-hidden><i /></span>
            <span className="skw-t"><b>{r.label}</b><small title={r.sub}>{r.sub}</small></span>
            <span className="skw-st">{r.key === 'claude-app' ? (r.state === 'on' ? 'on' : 'off') : WORD[r.state]}</span>
          </button>
        ))}
        <p className="hint skw-note">One copy, edited once, shows everywhere. Agents already running keep what they started with until they restart.</p>
      </div>
    </div>
  )
}
