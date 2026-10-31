import { useEffect, useRef, useState } from 'react'
import type { LimitView } from '../../shared/usage'
import { FIGURE_H, FIGURE_W, renderFigure } from '../profile/figure'
import type { Role } from '../world/worldState'
import { OutlineIcon } from './IconButton'

/** What the rail shows of an agent: who it is, whether it is at work, and, from the tile marks, whether it needs you or has finished. */
export interface RailAgent {
  id: string
  name: string
  working: boolean
  /** What it is doing, for its speech bubble: waiting for you, working, asleep, or none when idle. Taken from `working` when not given. */
  state?: 'idle' | 'working' | 'waiting' | 'asleep'
  /** For its face: the same character the office draws for it. */
  role?: Role
}

export const RAIL_MIN = 176
export const RAIL_MAX = 360
export const RAIL_DEFAULT = 224
const clampW = (w: number) => Math.round(Math.max(RAIL_MIN, Math.min(RAIL_MAX, w)))
const BUBBLE = { waiting: '?', working: '...', asleep: 'zz', idle: '' } as const
const WORD = { waiting: 'waiting for you', working: 'working', asleep: 'asleep', idle: 'idle' } as const

/** The agent's own character, drawn once in its current mood: the figure the profile card shows, small. */
function Face({ id, role, state }: { id: string; role: Role; state: 'idle' | 'working' | 'waiting' | 'asleep' }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let ctx: CanvasRenderingContext2D | null = null
    try {
      ctx = canvas.current?.getContext('2d') ?? null
    } catch {
      ctx = null
    }
    if (!ctx) return
    const f = renderFigure({ key: id, role, mood: state === 'working' ? 'working' : state === 'asleep' ? 'asleep' : 'idle', t: 0, reduced: true })
    ctx.putImageData(new ImageData(new Uint8ClampedArray(f.data), f.width, f.height), 0, 0)
  }, [id, role, state])
  return <canvas ref={canvas} className="rail-face" width={FIGURE_W} height={FIGURE_H} aria-hidden="true" />
}

/** The strip left of the chat while the office is hidden: the way back to it, and each agent with its name and whether it is at work, so one can be opened without it. */
export function OfficeRail({ agents, selected, marks, slim, onSlim, officeKeys, onShow, onSelect, usage, width, onWidth, terminalOpen, onTerminal }: { agents: RailAgent[]; selected: string | null; marks: Map<string, string>; /** Only the squares show, the names in tooltips. */ slim: boolean; onSlim: () => void; /** The keys that show the office, for its tooltip. */ officeKeys?: string; onShow: () => void; onSelect: (id: string) => void , /** What is left of the allowances of the account the open agent runs on; none when no agent is open. */ usage?: { five: LimitView; week: LimitView; account?: string } | null, /** How wide the open rail is, in px; none for the default. */ width?: number | null; /** Told the new width while it is dragged or keyed; none to go back to the default. */ onWidth?: (w: number | null) => void, /** Whether the terminal pane is open. */ terminalOpen?: boolean; /** Shows or hides the terminal pane; the button is only drawn when this is given. */ onTerminal?: () => void}) {
  // Folded, pointing at it (or a key on one of its buttons) opens the list over the page for as long as that lasts; a moment after it goes, it closes.
  const [peek, setPeek] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const open = () => (clearTimeout(timer.current), setPeek(true))
  const close = () => (clearTimeout(timer.current), (timer.current = setTimeout(() => setPeek(false), 300)))
  useEffect(() => () => clearTimeout(timer.current), [])
  const peeking = slim && peek
  return (
    <nav
      className={`office-rail ${slim ? 'slim' : ''} ${peeking ? 'peek' : ''}`}
      style={!slim && onWidth ? { width: width ?? RAIL_DEFAULT } : undefined}
      aria-label="Agents"
      onMouseEnter={() => slim && open()}
      onMouseLeave={() => slim && close()}
      onFocus={() => slim && open()}
      onBlur={(e) => slim && !e.currentTarget.contains(e.relatedTarget as Node | null) && close()}
    >
      <button className="rail-show" aria-label="Show the office" title={`Show the office${officeKeys ? ` (${officeKeys})` : ''}`} onClick={onShow}>
        <OutlineIcon name="office" size={16} />
        <span className="rail-name">Office</span>
      </button>
      <h6 className="rail-cap">{slim && !peeking ? agents.length : 'Agents'}</h6>
      {agents.map((a) => {
        const state = a.state ?? (a.working ? 'working' : 'idle')
        return (
          <button key={a.id} className={`rail-agent ${a.working ? 'working' : ''} is-${state}`} aria-label={a.name} aria-pressed={a.id === selected} title={slim ? a.name : undefined} onClick={() => onSelect(a.id)}>
            <span className="rail-tile">
              <Face id={a.id} role={a.role ?? 'senior'} state={state} />
              <span className="sr-only">{a.name.charAt(0).toUpperCase()}</span>
              {marks.has(a.id) && <span className={`wt-mark ${marks.get(a.id)}`} aria-hidden="true" />}
            </span>
            <span className="rail-name">{a.name}</span>
            <small>{WORD[state]}</small>
            {BUBBLE[state] && <span className="rail-bubble" aria-hidden="true">{BUBBLE[state]}</span>}
          </button>
        )
      })}
      {usage && (
        <div className="rail-usage" role="group" aria-label="Usage left on this account">
          {usage.account && <small className="ru-acct">Allowance · {usage.account}</small>}
          {(
            [
              ['5H', usage.five],
              ['WK', usage.week]
            ] as const
          ).map(([label, v]) => {
            const left = v.pct === null ? 0 : 100 - v.pct
            return (
              <div key={label} className={`ru-row ${v.level}`} title={`${label === '5H' ? '5-hour' : 'Weekly'}: ${v.pct === null ? 'no reading' : `${left}% left`}${v.reset ? `, resets ${v.reset === 'reset' || v.reset === 'now' ? 'now' : `in ${v.reset}`}` : ''}`}>
                <span className="ru-lb">{label}</span>
                <span className="ru-bar" aria-hidden="true">
                  {Array.from({ length: 12 }, (_, i) => <i key={i} className={`ru-seg ${i < Math.round((left / 100) * 12) ? 'on' : ''}`} />)}
                </span>
                <span className="ru-left">{v.pct === null ? '—' : `${left}%`}</span>
                <span className="ru-reset">{v.reset ? (v.reset === 'reset' || v.reset === 'now' ? 'resets now' : `resets in ${v.reset}`) : ''}</span>
              </div>
            )
          })}
        </div>
      )}
      {onTerminal && (
        <button className="rail-term" aria-pressed={!!terminalOpen} aria-label="Terminal" title={terminalOpen ? 'Hide the terminal; its shells keep running' : 'Open the terminal beside the chat'} onClick={onTerminal}>
          <span className="rail-tile" aria-hidden="true"><OutlineIcon name="terminal" size={16} /></span>
          <span className="rail-name">Terminal</span>
        </button>
      )}
      <button className="rail-fold" aria-label={slim ? 'Open the list' : 'Fold the list'} aria-expanded={!slim} title={slim ? 'Open the list' : 'Fold the list'} onClick={onSlim}>
        <span className="rail-tile" aria-hidden="true">{slim ? '›' : '‹'}</span>
        <span className="rail-name">Fold</span>
      </button>
      {!slim && onWidth && (
        <div
          className="rail-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the agent list"
          aria-valuemin={RAIL_MIN}
          aria-valuemax={RAIL_MAX}
          aria-valuenow={width ?? RAIL_DEFAULT}
          tabIndex={0}
          title="Drag to resize · double-click to reset"
          onDoubleClick={() => onWidth(null)}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
            e.preventDefault()
            onWidth(clampW((width ?? RAIL_DEFAULT) + (e.key === 'ArrowRight' ? 20 : -20)))
          }}
          onPointerDown={(e) => {
            e.preventDefault()
            const el = e.currentTarget
            const left = el.parentElement!.getBoundingClientRect().left
            el.setPointerCapture(e.pointerId)
            const move = (ev: PointerEvent) => onWidth(clampW(ev.clientX - left))
            const up = () => {
              el.removeEventListener('pointermove', move)
              el.removeEventListener('pointerup', up)
            }
            el.addEventListener('pointermove', move)
            el.addEventListener('pointerup', up)
          }}
        />
      )}
    </nav>
  )
}
