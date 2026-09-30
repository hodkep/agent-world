import { Container, Graphics, Rectangle } from 'pixi.js'
import { shade } from './grounds'
import { textPixels } from './pixelfont'

export interface DockItem {
  agentId: string
  name: string
  branch: string
  base: string
  /** Commits on the agent's branch that are not in its base yet. */
  ahead: number
  /** Changed files not committed yet. */
  dirty: number
  color: number
}
export interface DockHandlers {
  onHover: (d: DockItem | null, x: number, y: number) => void
  onOpen: (agentId: string) => void
}

/** Vans keep the bay they have; new ones take the lowest free bay; anything past the last bay waits. */
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

const BED_CRATES = 6
export const crateLayout = (ahead: number) => ({ shown: Math.min(ahead, BED_CRATES), more: Math.max(0, ahead - BED_CRATES) })

const VAN = { w: 40, h: 16 }
const BAY_W = 46
const MOVE_MS = 900
const INK = 0x14111c
const r = (g: Graphics, x: number, y: number, w: number, h: number, c: number, a = 1) => g.rect(x, y, w, h).fill(a === 1 ? c : { color: c, alpha: a })

function text(g: Graphics, s: string, x: number, y: number, color: number) {
  textPixels(s).forEach((row, ry) => [...row].forEach((c, rx) => c === '#' && r(g, x + rx, y + ry, 1, 1, color)))
}

function drawVan(g: Graphics, d: DockItem, t: number) {
  g.clear()
  const { shown, more } = crateLayout(d.ahead)
  // Wheels and chassis.
  r(g, 0, 12, VAN.w, 3, INK)
  for (const wx of [6, 30]) (r(g, wx, 11, 7, 5, INK), r(g, wx + 1, 12, 5, 3, 0x4a4e5a))
  // Flatbed with crates: a delivery waiting to be merged.
  r(g, 0, 9, 28, 3, INK)
  r(g, 1, 10, 26, 1, 0x8a5a33)
  for (let i = 0; i < shown; i++) {
    const cx = 2 + (i % 3) * 8
    const cy = i < 3 ? 2 : -4
    r(g, cx, cy + 2, 8, 8, INK)
    r(g, cx + 1, cy + 3, 6, 6, 0xc68e57)
    r(g, cx + 1, cy + 5, 6, 1, 0x8a5a33)
    r(g, cx + 3, cy + 3, 2, 6, 0x8a5a33)
    r(g, cx + 1, cy + 3, 6, 1, d.color)
  }
  // Cab in the agent's colour.
  r(g, 28, 3, 12, 10, INK)
  r(g, 29, 4, 10, 8, d.color)
  r(g, 33, 5, 5, 4, 0x8ec4dc)
  r(g, 29, 10, 10, 1, shade(d.color, 0.7))
  r(g, 38, 9, 2, 2, 0xffe9a0)
  if (more > 0) text(g, `+${more}`, 4, -10, 0xf2f2f8)
  // Uncommitted work: a blinking amber tag, because that one is not ready to go.
  if (d.dirty > 0 && Math.floor(t / 500) % 2) (r(g, 30, -2, 8, 6, INK), r(g, 31, -1, 6, 4, 0xf2b830))
  // Name plate on the road.
  const w = textPixels(d.name.slice(0, 8))[0]!.length
  r(g, Math.floor((VAN.w - w) / 2) - 2, 17, w + 4, 8, INK, 0.75)
  text(g, d.name.slice(0, 8), Math.floor((VAN.w - w) / 2), 18, 0xf2f2f8)
}

interface Parked {
  box: Container
  g: Graphics
  item: DockItem
  bay: number
  /** Where the van is heading along the kerb, and how it got here. */
  fromX: number
  toX: number
  since: number
  leaving?: boolean
}

/**
 * Delivery vans along the kerb: one per agent with unmerged work, loaded with a crate per commit. A van drives
 * off when its branch is merged (or its agent leaves). Click one to open that agent's changes and merge them.
 */
export class Dock {
  readonly view = new Container()
  private readonly vans = new Map<string, Parked>()
  private bays = new Map<string, number>()

  constructor(
    private readonly origin: { x: number; y: number; width: number },
    private readonly h: DockHandlers,
    private readonly dragged: () => boolean
  ) {}

  private slots() {
    return Math.max(1, Math.floor(this.origin.width / BAY_W))
  }
  private bayX(bay: number) {
    return this.origin.x + bay * BAY_W
  }

  setItems(items: DockItem[]) {
    const withWork = items.filter((d) => d.ahead > 0 || d.dirty > 0)
    const next = assignBays(this.bays, withWork.map((d) => d.agentId), this.slots())
    const now = performance.now()
    for (const [id, p] of this.vans) if (!next.has(id) && !p.leaving) (p.leaving = true, (p.fromX = p.box.x), (p.toX = this.origin.x + this.origin.width + 80), (p.since = now))
    for (const d of withWork) {
      const bay = next.get(d.agentId)
      if (bay === undefined) continue
      const have = this.vans.get(d.agentId)
      if (have && !have.leaving) {
        have.item = d
        continue
      }
      this.vans.set(d.agentId, this.arrive(d, bay, now))
    }
    this.bays = next
  }

  private arrive(d: DockItem, bay: number, now: number): Parked {
    const box = new Container()
    const g = new Graphics()
    box.addChild(g)
    box.y = this.origin.y
    box.x = this.origin.x - 70
    box.eventMode = 'static'
    box.cursor = 'pointer'
    box.hitArea = new Rectangle(0, -12, VAN.w, 38)
    const p: Parked = { box, g, item: d, bay, fromX: box.x, toX: this.bayX(bay), since: now }
    box.on('pointerover', (e) => this.h.onHover(p.item, e.global.x, e.global.y))
    box.on('pointermove', (e) => this.h.onHover(p.item, e.global.x, e.global.y))
    box.on('pointerout', () => this.h.onHover(null, 0, 0))
    box.on('pointertap', () => {
      if (!this.dragged()) this.h.onOpen(p.item.agentId)
    })
    this.view.addChild(box)
    return p
  }

  /** Van positions on screen (CSS px), for the page and tests to anchor to. */
  positions() {
    return [...this.vans]
      .filter(([, p]) => !p.leaving)
      .map(([agentId, p]) => {
        const g = p.box.getGlobalPosition()
        const s = this.view.parent?.scale.x ?? 1
        return { agentId, x: Math.round(g.x + (VAN.w / 2) * s), y: Math.round(g.y + (VAN.h / 2) * s) }
      })
  }

  update(t: number) {
    for (const [id, p] of this.vans) {
      const k = Math.min(1, (t - p.since) / MOVE_MS)
      const ease = 1 - (1 - k) ** 3
      p.box.x = Math.round(p.fromX + (p.toX - p.fromX) * ease)
      if (p.leaving) {
        p.box.alpha = 1 - k
        p.box.eventMode = 'none'
        if (k >= 1) {
          p.box.destroy({ children: true })
          this.vans.delete(id)
          continue
        }
      }
      drawVan(p.g, p.item, t)
    }
  }
}
