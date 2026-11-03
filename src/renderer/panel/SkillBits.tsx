import { Sprite } from '../pixel/Pixels'
import { METER_CELLS, SKILL_BUDGET, meterCells } from './libraryUsage'

/** A square for each day of the window, brighter for more uses; today is the last. */
export function DayStrip({ days }: { days: number[] }) {
  const n = days.reduce((a, b) => a + b, 0)
  return (
    <span className="skd" role="img" aria-label={`${n} ${n === 1 ? 'use' : 'uses'} in ${days.length} days`}>
      {days.map((v, i) => <i key={i} className={v ? `u${Math.min(v, 3)}` : undefined} title={`${days.length - 1 - i === 0 ? 'today' : `${days.length - 1 - i} days ago`}: ${v}`} />)}
    </span>
  )
}

/** The heads of the agents that used it, each in the colours the office gives that agent. */
export function Heads({ who, max = 4 }: { who: { id: string; name: string }[]; max?: number }) {
  if (!who.length) return null
  return (
    <span className="skh" aria-label={`Used by ${who.map((w) => w.name).join(', ')}`}>
      {who.slice(0, max).map((w) => <span key={w.id} className="skh-one" title={w.name}><Sprite seed={w.id} cell={3} /></span>)}
      {who.length > max && <small>+{who.length - max}</small>}
    </span>
  )
}

/** What the skills on for Claude cost at the start of every session, as cells against about what Claude keeps for them. */
export function CostMeter({ tokens, unused = 0 }: { tokens: number; unused?: number }) {
  const full = meterCells(tokens)
  // The used part is drawn first; the cells past it are what unused skills add.
  const spare = full - meterCells(tokens - unused)
  return (
    <span className="skm" title={`About ${tokens} tokens of skill names and descriptions at the start of every Claude session, out of the roughly ${SKILL_BUDGET} Claude keeps for them${unused ? `; ${unused} of it is skills nobody used in 30 days` : ''}.`}>
      <span className="skm-cells" aria-hidden>{Array.from({ length: METER_CELLS }, (_, i) => <i key={i} className={i < full - spare ? 'f' : i < full ? 'w' : undefined} />)}</span>
      <small>{tokens} tok{unused ? ` · ${unused} unused` : ''}</small>
    </span>
  )
}
