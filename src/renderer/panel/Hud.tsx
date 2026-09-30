import { useEffect, useMemo, useState } from 'react'
import type { PastSession } from '../../shared/api'
import { type UsageLimits, limitView } from '../../shared/usage'
import { CAR_COLORS, shade } from '../world/grounds'
import { ago } from './History'

const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7)
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`

/** A little parked car, crisp at an integer scale; its colour is stable per conversation. */
function PixelCar({ id, scale = 2 }: { id: string; scale?: number }) {
  const url = useMemo(() => {
    const color = CAR_COLORS[hash(id) % CAR_COLORS.length]!
    const c = document.createElement('canvas')
    c.width = 26
    c.height = 12
    const x = c.getContext('2d')!
    const fill = (col: string, a: number, b: number, w: number, h: number) => ((x.fillStyle = col), x.fillRect(a, b, w, h))
    fill('#14111c', 0, 0, 26, 12)
    fill(hex(color), 1, 1, 24, 10)
    fill(hex(shade(color, 0.78)), 7, 2, 12, 8)
    fill('#8ec4dc', 19, 3, 2, 6)
    fill('#63899a', 5, 3, 2, 6)
    fill('#ffe9a0', 24, 1, 1, 3)
    fill('#ffe9a0', 24, 8, 1, 3)
    fill('#d83a3a', 1, 1, 1, 3)
    fill('#d83a3a', 1, 8, 1, 3)
    return c.toDataURL()
  }, [id])
  return <img className="pixel-word" src={url} width={26 * scale} height={12 * scale} alt="" />
}

const SEGMENTS = 20

function Meter({ label, view }: { label: string; view: ReturnType<typeof limitView> }) {
  const lit = view.pct === null ? 0 : Math.round((view.pct / 100) * SEGMENTS)
  return (
    <div className={`meter level-${view.level}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={view.pct ?? undefined}>
      <span className="meter-label">{label}</span>
      <span className="meter-num">{view.pct === null ? '–' : `${Math.round(view.pct)}%`}</span>
      <span className="meter-bar" aria-hidden="true">
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <i key={i} className={i < lit ? 'on' : ''} />
        ))}
      </span>
      <span className="meter-reset">{view.reset ? (view.reset === 'reset' ? 'just reset' : `resets in ${view.reset}`) : ''}</span>
    </div>
  )
}

const MAX_CARS = 9

/**
 * The strip along the bottom of the office: the garage of past conversations (one car each; lit ones are
 * running now) and the subscription's usage limits, so neither needs a trip to a menu.
 */
export function Hud({
  past,
  limits,
  onResume,
  onOpenAgent,
  onMore
}: {
  past: PastSession[]
  limits: UsageLimits
  onResume: (sessionId: string) => void
  onOpenAgent: (agentId: string) => void
  onMore: () => void
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  const five = limitView(limits.fiveHour, now)
  const week = limitView(limits.sevenDay, now)
  const known = limits.fiveHour || limits.sevenDay
  const shown = past.slice(0, MAX_CARS)
  return (
    <div className="hud">
      <section className="garage" aria-label="Past conversations">
        <span className="hud-title">Garage</span>
        {shown.length === 0 ? (
          <span className="hud-empty">Conversations you finish park here, ready to bring back.</span>
        ) : (
          <ul>
            {shown.map((s) => (
              <li key={s.id}>
                <button
                  className={s.inUse ? 'car lit' : 'car'}
                  onClick={() => (s.inUse && s.agentId ? onOpenAgent(s.agentId) : onResume(s.id))}
                  title={`${s.title}\n${s.inUse ? `${s.agentName} is on this now` : `${ago(s.updated)} · click to bring it back`}`}
                  aria-label={s.inUse ? `${s.title}, running as ${s.agentName}` : `${s.title}, ${ago(s.updated)}. Bring it back`}
                >
                  <PixelCar id={s.id} />
                </button>
              </li>
            ))}
            {past.length > MAX_CARS && (
              <li>
                <button className="more" onClick={onMore}>
                  +{past.length - MAX_CARS}
                </button>
              </li>
            )}
          </ul>
        )}
      </section>
      <section className="limits" aria-label="Usage limits">
        {known ? (
          <>
            <Meter label="5-hour" view={five} />
            <Meter label="Weekly" view={week} />
          </>
        ) : (
          <span className="hud-empty">Usage limits appear after an agent’s first reply.</span>
        )}
      </section>
    </div>
  )
}
