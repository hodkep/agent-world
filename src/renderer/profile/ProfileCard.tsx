import { useEffect, useRef, useState } from 'react'
import { type CardData, factRows } from './facts'
import { FIGURE_H, FIGURE_W, figureMood, renderFigure } from './figure'
import { levelOf } from './format'

/** Reduced motion, as the person set it for their system. */
export function useReducedMotion() {
  const [r, setR] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const q = matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setR(q.matches)
    q.addEventListener('change', on)
    return () => q.removeEventListener('change', on)
  }, [])
  return r
}

/** The portrait: redrawn about ten times a second, only while the page is showing; one still frame with reduced motion. */
function Portrait({ id, role, activity, reduced }: Pick<CardData, 'id' | 'role' | 'activity'> & { reduced: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    let raf = 0
    let last = -1
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw)
      const frame = reduced ? 0 : Math.floor(t / 100)
      if (document.hidden || frame === last) return
      last = frame
      const f = renderFigure({ key: id, role, mood: figureMood(activity), t, reduced })
      ctx.putImageData(new ImageData(new Uint8ClampedArray(f.data), f.width, f.height), 0, 0)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [id, role, activity, reduced])
  return (
    <div className="pc-portrait">
      <canvas ref={canvas} width={FIGURE_W} height={FIGURE_H} />
    </div>
  )
}

const ctxClass = (p: number) => (p > 80 ? 'bad' : p > 60 ? 'warn' : 'ok')

/**
 * The agent's profile card, in the world's own 8-bit look. Decorative: every fact is also in the side panel as text,
 * so nothing is only here.
 */
export function ProfileCard({ data, variant, now }: { data: CardData; variant: 'full' | 'compact' | 'docked'; now: number }) {
  const reduced = useReducedMotion()
  const rows = factRows(data, now)
  const lv = levelOf(data.add + data.del)
  const shown = variant === 'compact' ? rows.filter((r) => !r.more) : rows.filter((r) => r.key !== 'tools')
  const tools = data.profile?.tools ?? []
  return (
    <div className={`pc pc-${variant}`} data-agent={data.id}>
      <div className="pc-title">
        <span className={`pc-dot is-${figureMood(data.activity)}`} />
        <span className="pc-name">{data.name}</span>
        <span className="pc-role">{data.roleLabel}</span>
      </div>
      <div className="pc-body">
        <div className="pc-left">
          <Portrait id={data.id} role={data.role} activity={data.activity} reduced={reduced} />
          {variant !== 'compact' && (
            <div className="pc-lv">
              <span>LV {lv.level}</span>
              <span>{lv.pct}% XP</span>
              <i className="pc-bar">
                <b style={{ width: `${lv.pct}%` }} />
              </i>
            </div>
          )}
        </div>
        <dl className="pc-rows">
          {shown.map((r) => (
            <div key={r.key} className="pc-row">
              <dt>{r.label}</dt>
              <dd>{r.short ?? r.value}</dd>
              {r.key === 'context' && data.ctx !== null && (
                <i className={`pc-bar hp ${ctxClass(data.ctx)}`}>
                  <b style={{ width: `${Math.min(100, data.ctx)}%` }} />
                </i>
              )}
            </div>
          ))}
          {variant !== 'compact' && tools.length > 0 && (
            <div className="pc-tools">
              {tools.map(([n, c]) => (
                <span key={n}>
                  {n} {c}
                </span>
              ))}
            </div>
          )}
        </dl>
      </div>
    </div>
  )
}

/** The same facts as plain text, in the panel: what the keyboard and a screen reader get. */
export function ProfileFacts({ data, now }: { data: CardData; now: number }) {
  return (
    <details className="profile-facts">
      <summary>Profile</summary>
      <dl>
        {factRows(data, now).map((r) => (
          <div key={r.key}>
            <dt>{r.label}</dt>
            <dd>{r.value}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}
