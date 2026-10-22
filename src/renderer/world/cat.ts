import { Container, Graphics, Sprite } from 'pixi.js'
import { CatBrain, type CatSpots, type CatStep } from './catBrain'
import { type OfficeMap, type Pt, TILE, findPath } from './office'
import { type CatPose, catTexture } from './critters'

const WALK_TILES_PER_SEC = 2.6
/** The cat walks to the tile above the right end of a desk and then climbs onto it: it is drawn this far down, at the desk's front edge, in front of the keyboard and clear of the monitor. */
const DESK_DROP = TILE - 1
const SPRITE = { w: 16, h: 10 }

/** The office cat: it naps, sits to wash and now and then climbs on a desk, as its brain decides. It has no seat, no name and no task. */
export class Cat {
  readonly view = new Container()
  private readonly body = new Sprite()
  private readonly shadow = new Graphics()
  private tile: Pt
  private px: number
  private py: number
  private path: Pt[] = []
  private steps: CatStep[] = []
  private current: CatStep | null = null
  private left = 0
  private flip = false
  private walkClock = 0
  private alpha = 0
  private shown = false
  state: 'walk' | 'nap' | 'sit' | 'desk' = 'sit'

  constructor(
    private readonly map: OfficeMap,
    private readonly brain: CatBrain,
    private readonly spots: CatSpots,
    start: Pt
  ) {
    this.tile = { ...start }
    this.px = start.x * TILE
    this.py = start.y * TILE
    this.view.addChild(this.shadow, this.body)
    this.view.visible = false
  }

  setShown(on: boolean) {
    this.shown = on
  }

  get at(): Pt {
    return this.tile
  }

  update(dtMs: number, t: number) {
    this.alpha = Math.max(0, Math.min(1, this.alpha + (this.shown ? dtMs : -dtMs) / 500))
    this.view.alpha = this.alpha
    this.view.visible = this.alpha > 0
    if (!this.current && !this.path.length) {
      if (!this.steps.length) this.steps = this.brain.next(this.spots)
      this.begin(this.steps.shift()!)
    }
    const cur = this.current
    if (cur?.kind === 'walk') {
      if (this.path.length) this.stepAlong(dtMs)
      if (!this.path.length) this.current = null
    } else if (cur?.kind === 'rest') {
      this.left -= dtMs
      if (this.left <= 0) this.current = null
    }
    const moving = this.path.length > 0
    const rest = cur?.kind === 'rest' ? cur.what : null
    this.state = moving ? 'walk' : rest ?? 'sit'
    let pose: CatPose = 'sit'
    if (moving) pose = Math.floor(this.walkClock / 160) % 2 ? 'walk1' : 'walk2'
    else if (rest === 'nap') pose = Math.floor(t / 1100) % 2 ? 'sleep' : 'sleep2'
    else if (rest === 'desk') pose = 'sit'
    this.body.texture = catTexture(pose)
    this.body.scale.x = this.flip ? -1 : 1
    this.body.x = this.flip ? SPRITE.w : 0
    const drop = rest === 'desk' ? DESK_DROP : 0
    this.body.y = TILE - SPRITE.h
    this.view.x = Math.round(this.px)
    this.view.y = Math.round(this.py) + drop
    // Over the desk and its monitor, so nothing hides it.
    this.view.zIndex = this.py + drop + (drop ? 30 : 7)
    this.shadow.clear()
    if (!drop) this.shadow.rect(2, TILE - 2, 12, 2).fill({ color: 0x000000, alpha: 0.35 })
  }

  private begin(step: CatStep) {
    this.current = step
    if (step.kind === 'walk') {
      this.path = findPath(this.map, this.tile, step.to) ?? []
      if (!this.path.length) this.current = null
      return
    }
    this.left = step.ms
  }

  private stepAlong(dtMs: number) {
    const next = this.path[0]!
    const tx = next.x * TILE
    const ty = next.y * TILE
    const dx = tx - this.px
    const dy = ty - this.py
    const dist = Math.hypot(dx, dy)
    const move = (WALK_TILES_PER_SEC * TILE * dtMs) / 1000
    this.walkClock += dtMs
    if (Math.abs(dx) > 0.5) this.flip = dx < 0
    if (dist <= move) {
      this.px = tx
      this.py = ty
      this.tile = next
      this.path.shift()
    } else {
      this.px += (dx / dist) * move
      this.py += (dy / dist) * move
    }
  }
}
