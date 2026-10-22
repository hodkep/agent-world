import type { Pt } from './office'
import type { Face } from './staff'

export type Notice = 'out' | 'sees' | 'behind'

const FACING: Record<Face, Pt> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }

/**
 * Whether someone standing at `boy` and facing `face` notices the boss at `boss`: not at all beyond `range` tiles, and within it only when the boss is in front of them or at their
 * side; a boss who comes from behind is not seen until he is on top of them.
 */
export function bossSees(boy: Pt, face: Face, boss: Pt, range = 6): Notice {
  const dx = boss.x - boy.x
  const dy = boss.y - boy.y
  if (Math.hypot(dx, dy) > range) return 'out'
  const f = FACING[face]
  return f.x * dx + f.y * dy >= 0 ? 'sees' : 'behind'
}
