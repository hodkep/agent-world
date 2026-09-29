import { Container, Graphics, Rectangle, Sprite } from 'pixi.js'
import type { Activity } from '../../shared/types'
import { type OfficeMap, type Pt, type Spot, TILE, findPath } from './office'
import type { Box } from './overlap'
import { textPixels } from './pixelfont'
import { type Pose, type View, characterTexture, iconTexture, paletteFor, pixelTexture } from './sprites'
import type { Role } from './worldState'

const WALK_TILES_PER_SEC = 5
const SPRITE_H = 24
// Sprite top relative to its tile: feet on the tile's bottom edge.
const STAND_Y = TILE - SPRITE_H
const SIT_Y = STAND_Y + 3
const TAG_H = 7

const labelColor = (role: Role, selected: boolean) => (selected ? 0xffe066 : role === 'boss' ? 0xf2c230 : 0xe4e4ee)

export class Character {
  /** Body and arms: depth-sorted with the furniture. */
  readonly view = new Container()
  /** Bubble, name tag and selection marker: always drawn above the whole office. */
  readonly overlay = new Container()
  private readonly shadow = new Graphics()
  private readonly ring = new Graphics()
  private readonly leader = new Graphics()
  private readonly body = new Sprite()
  private readonly arms = new Graphics()
  private readonly bubble = new Container()
  private readonly bubbleBg = new Graphics()
  private readonly icon = new Sprite()
  private readonly marker = new Graphics()
  private readonly tag = new Container()
  private readonly tagBg = new Graphics()
  private readonly tagText = new Sprite()
  private tagColor = -1
  private tile: Pt
  private px: number
  private py: number
  private path: Pt[] = []
  private goal: Spot
  private heading: View = 'front'
  private flip = false
  private walkClock = 0
  private top = STAND_Y
  private readonly blinkPhase: number
  /** Offsets the world applies so tags and bubbles never cover each other. */
  tagDy = 0
  bubbleDy = 0
  leaving = false
  activity: Activity = 'idle'
  role: Role
  selected = false

  constructor(
    // Key seeds the palette and hair so every character looks different even when labels repeat.
    readonly key: string,
    private readonly label: string,
    role: Role,
    public home: Spot,
    start: Spot,
    private readonly map: OfficeMap,
    onTap: () => void
  ) {
    this.role = role
    this.tile = { x: start.x, y: start.y }
    this.goal = start
    this.px = start.x * TILE + start.ox
    this.py = start.y * TILE
    this.blinkPhase = (key.charCodeAt(0) * 97 + key.length * 31) % 4000
    this.icon.anchor.set(0.5)
    this.bubble.addChild(this.bubbleBg, this.icon)
    this.tag.addChild(this.tagBg, this.tagText)
    this.view.addChild(this.ring, this.shadow, this.body, this.arms)
    this.overlay.addChild(this.leader, this.bubble, this.marker, this.tag)
    for (const c of [this.view, this.overlay]) {
      c.eventMode = 'static'
      c.cursor = 'pointer'
      c.on('pointertap', onTap)
    }
  }

  get at(): Pt {
    return this.tile
  }

  get arrived() {
    return this.path.length === 0 && this.tile.x === this.goal.x && this.tile.y === this.goal.y
  }

  isAt(spot: Pt) {
    return this.arrived && this.goal.x === spot.x && this.goal.y === spot.y
  }

  goTo(spot: Spot) {
    if (spot.x === this.goal.x && spot.y === this.goal.y) return
    const from = this.path[0] ?? this.tile
    const path = findPath(this.map, from, spot)
    if (!path) return
    this.goal = spot
    this.path = this.path.length ? [this.path[0]!, ...path] : path
  }

  /** World-space boxes of the name tag and bubble, before de-overlap offsets. */
  get tagBox(): Box {
    const w = this.tagWidth()
    return { id: this.key, x: this.view.x + TILE / 2 - w / 2, y: this.view.y + TILE + 1, w, h: TAG_H }
  }

  get bubbleBox(): Box | null {
    if (this.activity === 'idle') return null
    return { id: this.key, x: this.view.x + TILE / 2 - 6, y: this.view.y + this.top - 12, w: 13, h: 12 }
  }

  update(dtMs: number, t: number) {
    const moving = this.path.length > 0
    if (moving) this.step(dtMs)
    const settled = !moving && this.arrived
    const seated = settled && this.goal.seated && !this.leaving
    const asleep = this.activity === 'asleep'

    let view: View = this.heading
    let pose: Pose = 'stand'
    if (moving) pose = Math.floor(this.walkClock / 130) % 2 ? 'walk1' : 'walk2'
    else if (settled) {
      view = this.goal.facing === 'up' ? 'back' : 'front'
      if (seated) pose = 'sit'
    }
    const blink = view !== 'back' && (asleep || (t + this.blinkPhase) % 4000 < 140)
    this.body.texture = characterTexture(this.key, this.role, view, pose, blink)
    const mirrored = view === 'side' && this.flip
    this.body.scale.x = mirrored ? -1 : 1
    this.body.x = mirrored ? TILE : 0
    const breathe = !moving && !asleep && Math.floor((t + this.blinkPhase) / 700) % 2 === 0 ? 1 : 0
    this.top = pose === 'sit' ? SIT_Y : STAND_Y
    this.body.y = this.top + (moving ? 0 : breathe) + (asleep && seated ? 1 : 0)

    this.view.x = Math.round(this.px)
    this.view.y = Math.round(this.py)
    this.view.zIndex = this.py + 8
    this.view.hitArea = new Rectangle(0, this.top - 2, TILE, SPRITE_H + 2)
    this.overlay.x = this.view.x
    this.overlay.y = this.view.y

    this.shadow.clear()
    if (!seated) {
      this.shadow.rect(2, TILE - 2, 12, 3).fill({ color: 0x000000, alpha: 0.4 })
      this.shadow.rect(4, TILE - 3, 8, 1).fill({ color: 0x000000, alpha: 0.25 })
    }
    this.ring.clear()
    if (this.selected) {
      // Selection lives at the character's feet, so it can never drift onto a neighbour.
      const pulse = Math.floor(t / 400) % 2
      this.ring.rect(1 - pulse, TILE - 3, 14 + pulse * 2, 1).fill(0xffe066)
      this.ring.rect(0 - pulse, TILE - 2, 1, 2).fill(0xffe066)
      this.ring.rect(15 + pulse, TILE - 2, 1, 2).fill(0xffe066)
      this.ring.rect(1 - pulse, TILE, 14 + pulse * 2, 1).fill(0xffe066)
    }
    this.drawArms(seated, view, t)
    this.drawBubble(t)
    this.drawMarker(t)
    this.drawTag()
  }

  private tagWidth() {
    return textPixels(this.label.slice(0, 12))[0]!.length + 4
  }

  private step(dtMs: number) {
    const next = this.path[0]!
    const final = this.path.length === 1
    const tx = next.x * TILE + (final ? this.goal.ox : 0)
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

  private drawArms(seated: boolean, view: View, t: number) {
    const g = this.arms
    g.clear()
    const pal = paletteFor(this.key, this.role)
    const busy = this.activity === 'implementing' || this.activity === 'running' || this.activity === 'researching'
    if (seated && view === 'back' && busy) {
      // Elbows working at the keyboard; typing is faster than reading.
      const speed = this.activity === 'researching' ? 420 : 110
      const a = Math.floor(t / speed) % 2
      g.rect(1, this.top + 13 + a, 2, 3).fill(pal.c)
      g.rect(13, this.top + 14 - a, 2, 3).fill(pal.c)
    }
    if (this.activity === 'permission') {
      const wave = Math.floor(t / 260) % 2
      const top = this.top + 1 - wave
      g.rect(13, top + 3, 2, 10).fill(pal.o)
      g.rect(13, top + 4, 2, 8).fill(pal.c)
      g.rect(12, top, 4, 4).fill(pal.o)
      g.rect(13, top + 1, 2, 2).fill(pal.s)
    }
  }

  private drawBubble(t: number) {
    const show = this.activity !== 'idle'
    this.bubble.visible = show
    if (!show) {
      this.leader.clear()
      return
    }
    const alarm = this.activity === 'permission'
    const blink = alarm && Math.floor(t / 300) % 2 === 0
    const g = this.bubbleBg
    g.clear()
    g.rect(-6, -5, 13, 10).fill(0x14111c)
    g.rect(-5, -4, 11, 8).fill(alarm ? (blink ? 0xe04040 : 0xffd6d6) : 0xf6f6fa)
    g.rect(-1, 5, 3, 1).fill(0x14111c)
    g.rect(0, 6, 1, 1).fill(0x14111c)
    this.icon.texture = iconTexture(this.activity, alarm ? (blink ? 0xffffff : 0xc02020) : 0x14111c)
    this.icon.x = 0.5
    this.bubble.x = TILE / 2
    this.bubble.y = this.top - 7 + this.bubbleDy + Math.round(Math.sin(t / 400))
    this.leader.clear()
    if (this.bubbleDy < 0) {
      // Pushed up to clear a neighbour: a dotted leader keeps it tied to this head.
      for (let y = this.bubble.y + 7; y < this.top; y += 2) this.leader.rect(TILE / 2, y, 1, 1).fill(0xf6f6fa)
    }
  }

  private drawMarker(t: number) {
    const g = this.marker
    g.clear()
    if (!this.selected) return
    if (this.activity !== 'idle') return
    const y = this.top - 6 + (Math.floor(t / 300) % 2)
    g.rect(5, y, 7, 1).fill(0xffe066)
    g.rect(6, y + 1, 5, 1).fill(0xffe066)
    g.rect(7, y + 2, 3, 1).fill(0xffe066)
    g.rect(8, y + 3, 1, 1).fill(0xffe066)
  }

  private drawTag() {
    const color = labelColor(this.role, this.selected)
    const text = this.label.slice(0, 12)
    const w = this.tagWidth()
    if (color !== this.tagColor) {
      this.tagColor = color
      this.tagText.texture = pixelTexture(textPixels(text), { '#': color }, `label/${text}/${color}`)
      this.tagBg.clear()
      this.tagBg.rect(0, 0, w, TAG_H).fill({ color: 0x0c0a12, alpha: 0.82 })
      this.tagText.x = 2
      this.tagText.y = 1
    }
    this.tag.x = TILE / 2 - Math.floor(w / 2)
    this.tag.y = TILE + 1 + this.tagDy
  }
}
