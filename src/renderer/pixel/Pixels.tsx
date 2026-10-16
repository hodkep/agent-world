import { paletteFor } from '../world/sprites'
import { SPRITE } from './glyphs'

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`

/** An agent as a small figure, in the colours the office gives that agent (its hair, skin and shirt come from the same key as the character in the world). */
export function Sprite({ seed, cell = 3 }: { seed: string; cell?: number }) {
  const p = paletteFor(seed, 'senior')
  const fill: Record<string, string> = { H: hex(p.h), S: hex(p.s), B: hex(p.c), L: hex(p.p) }
  return (
    <svg className="pxg spr" width={SPRITE[0].length * cell} height={SPRITE.length * cell} viewBox={`0 0 ${SPRITE[0].length} ${SPRITE.length}`} shapeRendering="crispEdges" aria-hidden="true">
      {SPRITE.flatMap((r, y) => [...r].map((c, x) => (fill[c] ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill[c]} /> : null)))}
    </svg>
  )
}
