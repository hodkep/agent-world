import { Container, Graphics, Rectangle, Sprite } from 'pixi.js'
import { type OfficeMap, type Pt, TILE, findPath } from './office'
import type { Face, Step, Then } from './staff'
import type { View } from './sprites'
import { HAND_AT, type StaffKind, type StaffPose, staffTexture } from './staffSprites'

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
  carrying: '' | 'jar' | 'old-jar' | 'bag' | 'parcel' | 'tray' = ''
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
    this.view.addChild(this.shadow, this.body, this.jar)
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
    const breathe = !moving && Math.floor(t / (this.pose === 'clasp' ? 450 : 700)) % 2 === 0 ? 1 : 0
    this.body.y = STAND_Y + (moving ? 0 : breathe)
    this.view.x = Math.round(this.px)
    this.view.y = Math.round(this.py)
    this.view.zIndex = this.py + 8
    this.shadow.clear()
    this.shadow.rect(2, TILE - 2, 12, 3).fill({ color: 0x000000, alpha: 0.4 })
    // What he holds rides a little with his steps; what he is using is drawn in the hand the pose lifts.
    const bob = moving && Math.floor(this.walkClock / 150) % 2 ? -1 : 0
    const at = (x: number, w: number) => (mirrored ? TILE - x - w : x)
    const g = this.jar
    g.clear()
    const box = (x: number, y: number, w: number, h: number, c: number) => g.rect(at(x, w), STAND_Y + y, w, h).fill(c)
    const hand = mirrored ? 1 : 10
    switch (this.carrying) {
      case 'jar':
      case 'old-jar':
        box(hand, 12 + bob, 5, 8, 0x1a1522)
        box(hand + 1, 13 + bob, 3, 6, this.carrying === 'jar' ? 0x8ac4f0 : 0xdbe8f4)
        break
      case 'bag':
        box(hand - 1, 13 + bob, 7, 8, 0x1a1522)
        box(hand, 14 + bob, 5, 6, 0x5a5a68)
        box(hand + 2, 12 + bob, 1, 2, 0x5a5a68)
        break
      case 'parcel':
        box(hand - 2, 12 + bob, 8, 7, 0x1a1522)
        box(hand - 1, 13 + bob, 6, 5, 0xb08a52)
        box(hand + 1, 13 + bob, 1, 5, 0xe8d8a8)
        break
      case 'tray':
        box(hand - 3, 15 + bob, 10, 2, 0x1a1522)
        box(hand - 2, 15 + bob, 8, 1, 0xc8ccd8)
        for (const dx of [-2, 1, 4]) (box(hand + dx, 12 + bob, 3, 3, 0x1a1522), box(hand + dx + 1, 13 + bob, 1, 1, 0xf4f4f8))
        break
    }
    // Looking out at the street with his hands behind him, he whistles: a music note drifts up from his head now and then.
    if (this.pose === 'clasp' && !moving) {
      const phase = (t % 2200) / 2200
      if (phase < 0.7) {
        const nx = (mirrored ? 2 : 11) + Math.round(Math.sin(phase * 7) * 1.5)
        const ny = STAND_Y - 1 - Math.round(phase * 10)
        box(nx, ny - STAND_Y + 3, 2, 2, 0xf2c230)
        box(nx + 1, ny - STAND_Y, 1, 4, 0xf2c230)
        box(nx + 2, ny - STAND_Y, 1, 1, 0xf2c230)
      }
    }
    const prop = this.current?.kind === 'wait' ? this.current.prop : undefined
    const lifted = this.pose === 'sip' || this.pose === 'call' || this.pose === 'chin' || this.pose === 'hold' || this.pose === 'wipe' ? HAND_AT[this.pose] : null
    const spot = lifted ? (view === 'side' ? lifted.side : lifted.front) : null
    if (prop && spot) {
      const x = view === 'side' ? spot.x : spot.x
      switch (prop) {
        case 'cup':
          box(x - 1, spot.y, 4, 4, 0x1a1522)
          box(x, spot.y + 1, 2, 2, 0xf4f4f8)
          if (Math.floor(t / 300) % 2) box(x, spot.y - 2, 1, 2, 0xdcdcec)
          break
        case 'phone':
          box(x, spot.y, 3, 6, 0x1a1522)
          box(x + 1, spot.y + 1, 1, 3, 0x8ac4f0)
          break
        case 'book': {
          // An open book held at the chest: two pages with a few lines of text, and a page turning every couple of seconds.
          const cycle = t % 2400
          const turn = cycle < 260 ? cycle / 260 : -1
          const flip = Math.floor(t / 2400) % 3
          box(x - 2, spot.y - 1, 11, 7, 0x1a1522)
          box(x - 1, spot.y, 4, 5, 0xf4eddc)
          box(x + 4, spot.y, 4, 5, 0xf4eddc)
          box(x + 3, spot.y - 1, 1, 7, 0x6a3a2a)
          for (const row of [1, 3]) {
            box(x, spot.y + row, 2 + ((flip + row) % 2), 1, 0x9a8a6a)
            box(x + 5, spot.y + row, 2 + ((flip + row + 1) % 2), 1, 0x9a8a6a)
          }
          if (turn >= 0) {
            // The right page lifts, stands on its edge in the middle, and lands on the left.
            const w = Math.round(Math.abs(Math.cos(turn * Math.PI)) * 4)
            box(turn < 0.5 ? x + 4 : x + 4 - w, spot.y - 1, Math.max(1, w), 6, 0xfff6e0)
          }
          break
        }
        case 'can':
          box(x + 2, spot.y, 6, 5, 0x1a1522)
          box(x + 3, spot.y + 1, 4, 3, 0x6aa0c8)
          box(x + 8, spot.y + 1, 3, 1, 0x6aa0c8)
          break
        case 'cloth': {
          const dx = Math.round(Math.sin(t / 90) * 3)
          box(x + dx, spot.y + 1, 4, 4, 0x1a1522)
          box(x + dx + 1, spot.y + 2, 2, 2, 0xcfe8f5)
          break
        }
        case 'broom': {
          const dx = Math.round(Math.sin(t / 110) * 2)
          box(x + 1 + dx, spot.y - 2, 1, 11, 0x8a6a3a)
          box(x - 1 + dx, spot.y + 8, 5, 3, 0x1a1522)
          box(x + dx, spot.y + 9, 3, 2, 0xc8a040)
          break
        }
      }
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
