import { Container, Graphics, Rectangle } from 'pixi.js'
import { CAR_COLORS, car, lotLayout } from './grounds'
import type { OfficeMap } from './office'
import { textPixels } from './pixelfont'

export interface ParkedSession {
  id: string
  title: string
  updated: number
}
export interface LotHandlers {
  /** The pointer is over a car (with its screen position) or has left it. */
  onHover: (s: ParkedSession | null, x: number, y: number) => void
  onPick: (id: string) => void
}

/** Cars keep the bay they have; new ones take the lowest free bay; anything past the last bay is left out. */
export function assignBays(prev: Map<string, number>, ids: string[], bays: number): Map<string, number> {
  const next = new Map<string, number>()
  const taken = new Set<number>()
  for (const id of ids) {
    const b = prev.get(id)
    if (b !== undefined && b < bays) (next.set(id, b), taken.add(b))
  }
  for (const id of ids) {
    if (next.has(id)) continue
    let b = 0
    while (taken.has(b)) b++
    if (b >= bays) continue
    next.set(id, b)
    taken.add(b)
  }
  return next
}

const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7)
const LEAVE_MS = 900

interface Parked {
  box: Container
  session: ParkedSession
  leftAt?: number
}

/** The car park across the road: one parked car per past conversation. Clicking a car brings that conversation back. */
export class Lot {
  readonly view = new Container()
  private readonly layout: ReturnType<typeof lotLayout>
  private readonly cars = new Map<string, Parked>()
  private bays = new Map<string, number>()
  private readonly label = new Graphics()

  constructor(map: OfficeMap, private readonly h: LotHandlers, private readonly dragged: () => boolean) {
    this.layout = lotLayout(map)
    this.view.addChild(this.label)
    this.drawLabel(true)
  }

  private drawLabel(empty: boolean) {
    const g = this.label
    g.clear()
    const rows = textPixels(empty ? 'PAST CHATS PARK HERE' : 'PAST CHATS')
    const x = this.layout.firstX + this.layout.bays * this.layout.bayW - rows[0]!.length - 24
    rows.forEach((row, ry) => [...row].forEach((c, rx) => c === '#' && g.rect(x + rx, this.layout.y + 46 + ry, 1, 1).fill({ color: 0xd8d8e0, alpha: 0.5 })))
  }

  setSessions(list: ParkedSession[]) {
    const next = assignBays(this.bays, list.map((s) => s.id), this.layout.bays)
    for (const [id, p] of this.cars) if (!next.has(id) && p.leftAt === undefined) p.leftAt = performance.now()
    for (const s of list) {
      const bay = next.get(s.id)
      if (bay === undefined || this.cars.has(s.id)) continue
      this.cars.set(s.id, this.park(s, bay))
    }
    this.bays = next
    this.drawLabel(list.length === 0)
  }

  /** The conversation was picked: its car drives off while the agent walks in. */
  depart(id: string) {
    const p = this.cars.get(id)
    if (p && p.leftAt === undefined) p.leftAt = performance.now()
    this.bays.delete(id)
    this.h.onHover(null, 0, 0)
  }

  private park(s: ParkedSession, bay: number): Parked {
    const box = new Container()
    box.x = this.layout.firstX + bay * this.layout.bayW + 9
    box.y = this.layout.y + 6
    const body = new Graphics()
    car(body, 0, 0, CAR_COLORS[hash(s.id) % CAR_COLORS.length]!, { vertical: true, dir: -1 })
    const ring = new Graphics()
    ring.rect(-4, -3, 20, 32).stroke({ color: 0xffe066, width: 1 })
    ring.visible = false
    box.addChild(body, ring)
    box.eventMode = 'static'
    box.cursor = 'pointer'
    box.hitArea = new Rectangle(-4, -3, 20, 32)
    box.on('pointerover', (e) => {
      ring.visible = true
      this.h.onHover(s, e.global.x, e.global.y)
    })
    box.on('pointerout', () => {
      ring.visible = false
      this.h.onHover(null, 0, 0)
    })
    box.on('pointertap', () => {
      if (!this.dragged()) this.h.onPick(s.id)
    })
    this.view.addChild(box)
    return { box, session: s }
  }

  /** Screen positions (CSS px, relative to the stage) of the parked cars: lets tests, and anything else outside the canvas, find them. */
  positions() {
    return [...this.cars]
      .filter(([, p]) => p.leftAt === undefined)
      .map(([id, p]) => {
        const g = p.box.getGlobalPosition()
        return { id, x: Math.round(g.x + 6 * this.view.parent!.scale.x), y: Math.round(g.y + 13 * this.view.parent!.scale.y) }
      })
  }

  update(t: number) {
    for (const [id, p] of this.cars) {
      if (p.leftAt === undefined) continue
      const k = (t - p.leftAt) / LEAVE_MS
      if (k >= 1) {
        p.box.destroy({ children: true })
        this.cars.delete(id)
        continue
      }
      p.box.eventMode = 'none'
      p.box.y = this.layout.y + 6 - Math.round(k * 24)
      p.box.alpha = 1 - k
    }
  }
}
