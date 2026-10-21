import { Container, Graphics, Rectangle, Sprite } from 'pixi.js'
import { type OfficeMap, type Pt, TILE, findPath } from './office'
import type { Face, Step, Then } from './staff'
import type { View } from './sprites'
import { type StaffKind, type StaffPose, staffTexture } from './staffSprites'

const WALK_TILES_PER_SEC = 4
const SPRITE_H = 24
const STAND_Y = TILE - SPRITE_H
/** A held staff member is let go after this long, whatever happened to whoever held him. */
const HOLD_MAX_MS = 25_000

const viewOf = (face: Face): View => (face === 'up' ? 'back' : face === 'down' ? 'front' : 'side')

/** An office boy or a supervisor: a figure that walks the office's tiles and does the steps it is given. It has no seat, no name tag and no task. */
export class StaffActor {
  readonly view = new Container()
  private readonly body = new Sprite()
  private readonly jar = new Graphics()
  private readonly cloth = new Graphics()
  private alpha = 0
  private shown = false
  private readonly shadow = new Graphics()
  private tile: Pt
  private px: number
  private py: number
  private path: Pt[] = []
  private steps: Step[] = []
  private current: Step | null = null
  private waitLeft = 0
  private heading: View = 'front'
  private flip = false
  private walkClock = 0
  private held = 0
  /** What is in his hands: a new jar of water, the cooler's old empty one, or a bag of rubbish. */
  carrying: '' | 'jar' | 'old-jar' | 'bag' = ''
  pose: StaffPose = 'stand'
  /** What he is saying now (his step's line), for specs. */
  said = ''

  constructor(
    readonly kind: StaffKind,
    readonly label: string,
    private readonly map: OfficeMap,
    start: Pt,
    onHover: (over: boolean) => void
  ) {
    this.tile = { ...start }
    this.px = start.x * TILE
    this.py = start.y * TILE
    this.view.addChild(this.shadow, this.body, this.cloth, this.jar)
    this.view.visible = false
    this.view.eventMode = 'static'
    this.view.cursor = 'help'
    this.view.hitArea = new Rectangle(0, STAND_Y - 2, TILE, SPRITE_H + 2)
    this.view.on('pointerover', () => onHover(true))
    this.view.on('pointerout', () => onHover(false))
  }

  /** Comes into view or goes out of it, fading over about half a second. */
  setShown(on: boolean) {
    this.shown = on
  }

  fade(dtMs: number) {
    this.alpha = Math.max(0, Math.min(1, this.alpha + (this.shown ? dtMs : -dtMs) / 500))
    this.view.alpha = this.alpha
    this.view.visible = this.alpha > 0
  }

  get at(): Pt {
    return this.tile
  }

  /** Nothing left to do: the director gives it the next thing. */
  get free() {
    return this.held === 0 && this.current === null && this.steps.length === 0 && this.path.length === 0
  }

  get isHeld() {
    return this.held > 0
  }

  give(steps: Step[]) {
    this.steps.push(...steps)
  }

  /** Stands where he is, dropping what he was doing, until `release`: for someone coming to give him an order. */
  hold() {
    this.steps = []
    this.current = null
    this.waitLeft = 0
    this.path = []
    this.held = HOLD_MAX_MS
    this.pose = 'stand'
  }

  release() {
    this.held = 0
  }

  /** Turns to face a tile next to him, as when someone speaks to him. */
  faceTile(p: Pt): Face {
    const dx = p.x - this.tile.x
    const dy = p.y - this.tile.y
    return Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down'
  }

  update(dtMs: number, t: number, on: { then: (what: Then) => void; say: (text: string, ms: number) => void }) {
    this.fade(dtMs)
    if (this.held > 0) this.held = Math.max(0, this.held - dtMs)
    let face: Face | null = null
    if (this.held === 0 && !this.current && this.steps.length) this.begin(this.steps.shift()!, on)
    const cur = this.current
    if (cur?.kind === 'walk') {
      if (this.path.length) this.stepAlong(dtMs)
      if (!this.path.length) this.current = null
    } else if (cur?.kind === 'wait') {
      this.waitLeft -= dtMs
      face = cur.face ?? null
      if (this.waitLeft <= 0) {
        this.current = null
        this.pose = 'stand'
        this.said = ''
      }
    }
    const moving = this.path.length > 0
    let view = this.heading
    let pose: StaffPose = 'stand'
    if (moving) pose = Math.floor(this.walkClock / 150) % 2 ? 'walk1' : 'walk2'
    else {
      if (face) {
        view = viewOf(face)
        if (view === 'side') this.flip = face === 'left'
      }
      pose = this.pose
    }
    this.body.texture = staffTexture(this.kind, view, pose)
    const mirrored = view === 'side' && this.flip
    this.body.scale.x = mirrored ? -1 : 1
    this.body.x = mirrored ? TILE : 0
    const breathe = !moving && Math.floor(t / 700) % 2 === 0 ? 1 : 0
    this.body.y = STAND_Y + (moving ? 0 : breathe)
    this.view.x = Math.round(this.px)
    this.view.y = Math.round(this.py)
    this.view.zIndex = this.py + 8
    this.shadow.clear()
    this.shadow.rect(2, TILE - 2, 12, 3).fill({ color: 0x000000, alpha: 0.4 })
    // What he holds rides a little with his steps; the cloth moves to and fro on whatever he is wiping.
    const bob = moving && Math.floor(this.walkClock / 150) % 2 ? -1 : 0
    const hand = mirrored ? 1 : 10
    this.jar.clear()
    if (this.carrying === 'jar') {
      this.jar.rect(hand, STAND_Y + 12 + bob, 5, 8).fill(0x1a1522)
      this.jar.rect(hand + 1, STAND_Y + 13 + bob, 3, 6).fill(0x8ac4f0)
    } else if (this.carrying === 'old-jar') {
      this.jar.rect(hand, STAND_Y + 12 + bob, 5, 8).fill(0x1a1522)
      this.jar.rect(hand + 1, STAND_Y + 13 + bob, 3, 6).fill(0xdbe8f4)
    } else if (this.carrying === 'bag') {
      this.jar.rect(hand - 1, STAND_Y + 13 + bob, 7, 8).fill(0x1a1522)
      this.jar.rect(hand, STAND_Y + 14 + bob, 5, 6).fill(0x5a5a68)
      this.jar.rect(hand + 2, STAND_Y + 12 + bob, 1, 2).fill(0x5a5a68)
    }
    this.cloth.clear()
    if (this.pose === 'wipe' && this.current?.kind === 'wait') {
      const x = (mirrored ? -4 : 13) + Math.round(Math.sin(t / 90) * 3)
      this.cloth.rect(x, STAND_Y + 12, 4, 4).fill(0x1a1522)
      this.cloth.rect(x + 1, STAND_Y + 13, 2, 2).fill(0xcfe8f5)
    }
  }

  private begin(step: Step, on: { then: (what: Then) => void; say: (text: string, ms: number) => void }) {
    this.current = step
    if (step.kind === 'walk') {
      this.path = findPath(this.map, this.tile, step.to) ?? []
      if (!this.path.length) this.current = null
      return
    }
    this.waitLeft = step.ms
    this.pose = step.pose ?? 'stand'
    if (step.say) {
      this.said = step.say
      on.say(step.say, step.ms)
    }
    if (step.then) on.then(step.then)
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
    if (Math.abs(dy) > Math.abs(dx)) this.heading = dy < 0 ? 'back' : 'front'
    else if (Math.abs(dx) > 0.5) {
      this.heading = 'side'
      this.flip = dx < 0
    }
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
