import { Container, Graphics, Rectangle, Sprite } from 'pixi.js'
import type { Activity } from '../../shared/types'
import { type OfficeMap, type Pt, type Spot, TILE, findPath } from './office'
import type { Box } from './overlap'
import { textPixels } from './pixelfont'
import { modeInfo } from '../../shared/modes'
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
  private readonly fx = new Graphics()
  private readonly fxText = new Sprite()
  private fxTextKey = ''
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
  private tagShown = ''
  /** How many subagents this one has started; shown after the name. */
  subagents = 0
  /** The seat (0-5) of a subagent gathered at its main agent's desk, else null. It has no name tag (the main agent's carries the count), and only the first two seats show an activity bubble. */
  gathered: number | null = null
  get tagShownNow() {
    return this.gathered === null
  }
  /** Claude's permission mode: anything but the default shows as a badge on the name tag and a dashed line at the feet. */
  mode: string | undefined
  private readonly badge = new Container()
  private badgeMode = ''
  private readonly modeLine = new Graphics()
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
  /** How much faster than a walk it moves (a subagent rushing to or from its car). */
  speedMul = 1
  /** Out of sight and still: a subagent whose car has not parked yet. */
  waiting = false
  // Free walking outside the office's tiles, in the cell's own pixels: before the path (from a car to the door) and after it (back to the car).
  private pre: Pt[] = []
  private post: Pt[] = []
  activity: Activity = 'idle'
  detail?: string
  contextPct: number | null = null
  private seated = false
  private readonly gauge = new Graphics()
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
    this.tag.addChild(this.tagBg, this.tagText, this.gauge, this.badge)
    this.view.addChild(this.ring, this.modeLine, this.shadow, this.body, this.arms)
    this.overlay.addChild(this.fx, this.fxText, this.leader, this.bubble, this.marker, this.tag)
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
    return this.path.length === 0 && this.pre.length === 0 && this.post.length === 0 && this.tile.x === this.goal.x && this.tile.y === this.goal.y
  }

  /** Steps out at this spot (centre x, feet y) and walks to each point in turn before heading for its place. */
  appearAt(cx: number, feetY: number, via: Pt[]) {
    this.px = cx - TILE / 2
    this.py = feetY - TILE
    this.pre = via.map((p) => ({ x: p.x - TILE / 2, y: p.y - TILE }))
    this.waiting = false
  }

  /** After reaching the door, walks on to each point in turn (centre x, feet y). */
  walkOutVia(via: Pt[]) {
    this.post = via.map((p) => ({ x: p.x - TILE / 2, y: p.y - TILE }))
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
    if (this.activity === 'idle' || this.effect() || this.quiet()) return null
    const atDesk = this.seated && this.goal.facing === 'up'
    return { id: this.key, x: this.view.x + (atDesk ? TILE : TILE / 2 - 6), y: this.view.y + this.top + (atDesk ? -1 : -12), w: 13, h: 12 }
  }

  private quiet() {
    return this.gathered !== null && this.gathered >= 2
  }

  update(dtMs: number, t: number) {
    this.view.visible = this.overlay.visible = !this.waiting
    if (this.waiting) return
    const free = this.pre.length > 0 || (this.path.length === 0 && this.post.length > 0)
    const moving = this.path.length > 0 || free
    if (free) this.freeStep(dtMs, this.pre.length > 0 ? this.pre : this.post)
    else if (moving) this.step(dtMs)
    const settled = !moving && this.arrived
    const seated = settled && this.goal.seated && !this.leaving
    const asleep = this.activity === 'asleep'

    let view: View = this.heading
    let pose: Pose = 'stand'
    if (moving) pose = Math.floor(this.walkClock / 130) % 2 ? 'walk1' : 'walk2'
    else if (settled) {
      view = this.goal.facing === 'up' ? 'back' : this.goal.facing === 'down' ? 'front' : 'side'
      if (view === 'side') this.flip = this.goal.facing === 'left'
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
    this.modeLine.clear()
    const mi = this.mode && this.mode !== 'default' ? modeInfo(this.mode) : null
    if (mi && !seated) for (let x = 2; x < 14; x += 2) if ((x / 2 + Math.floor(t / 320)) % 3 !== 0) this.modeLine.rect(x, TILE + 1, 1, 1).fill(mi.color)
    this.ring.clear()
    if (this.selected) {
      // Selection lives at the character's feet, so it can never drift onto a neighbour.
      const pulse = Math.floor(t / 400) % 2
      this.ring.rect(1 - pulse, TILE - 3, 14 + pulse * 2, 1).fill(0xffe066)
      this.ring.rect(0 - pulse, TILE - 2, 1, 2).fill(0xffe066)
      this.ring.rect(15 + pulse, TILE - 2, 1, 2).fill(0xffe066)
      this.ring.rect(1 - pulse, TILE, 14 + pulse * 2, 1).fill(0xffe066)
    }
    this.seated = seated
    this.drawArms(seated, view, t)
    this.drawEffect(t)
    this.drawBubble(t)
    this.drawMarker(t)
    this.drawTag()
  }

  private tagLabel() {
    return `${this.label.slice(0, 8)}${this.subagents > 0 ? ` x${this.subagents}` : ''}`.slice(0, 12)
  }

  private tagWidth() {
    return textPixels(this.tagLabel())[0]!.length + 4
  }

  private step(dtMs: number) {
    const next = this.path[0]!
    const final = this.path.length === 1
    const tx = next.x * TILE + (final ? this.goal.ox : 0)
    const ty = next.y * TILE
    const dx = tx - this.px
    const dy = ty - this.py
    const dist = Math.hypot(dx, dy)
    const move = (WALK_TILES_PER_SEC * TILE * dtMs * this.speedMul) / 1000
    this.walkClock += dtMs * this.speedMul
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

  /** Walks straight towards the next free point (outside the office's tiles). */
  private freeStep(dtMs: number, list: Pt[]) {
    const next = list[0]!
    const dx = next.x - this.px
    const dy = next.y - this.py
    const dist = Math.hypot(dx, dy)
    const move = (WALK_TILES_PER_SEC * TILE * dtMs * this.speedMul) / 1000
    this.walkClock += dtMs * this.speedMul
    if (Math.abs(dy) > Math.abs(dx)) this.heading = dy < 0 ? 'back' : 'front'
    else if (Math.abs(dx) > 0.5) {
      this.heading = 'side'
      this.flip = dx < 0
    }
    if (dist <= move) {
      this.px = next.x
      this.py = next.y
      list.shift()
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

  /** Big states get a scene instead of a bubble: a hologram for commands, a thought web, a page being written. */
  private effect(): 'hologram' | 'thought' | 'writing' | null {
    if (this.activity === 'thinking') return 'thought'
    if (!this.seated) return null
    if (this.activity === 'running') return 'hologram'
    if (this.activity === 'implementing') return 'writing'
    return null
  }

  private caption(text: string, color: number, x: number, y: number) {
    const key = `${text}/${color}`
    if (key !== this.fxTextKey) {
      this.fxTextKey = key
      this.fxText.texture = pixelTexture(textPixels(text), { '#': color }, `fx/${key}`)
    }
    this.fxText.visible = true
    this.fxText.x = x
    this.fxText.y = y
  }

  private drawEffect(t: number) {
    const g = this.fx
    g.clear()
    this.fxText.visible = false
    const kind = this.effect()
    if (kind === 'hologram') this.drawHologram(g, t)
    else if (kind === 'thought') this.drawThought(g, t)
    else if (kind === 'writing') this.drawWriting(g, t)
  }

  // A sci-fi projection rising from the desk: cyan panel, scanlines, scrolling output, the live command on top.
  private drawHologram(g: Graphics, t: number) {
    const W = 48
    const H = 28
    const x0 = TILE / 2 - W / 2
    const y0 = this.top - 30 - H
    const flicker = 0.85 + 0.15 * Math.sin(t / 37) * Math.sin(t / 91)
    const cyan = 0x5ae4ff
    const emitterY = this.top - 18
    g.poly([TILE / 2 - 2, emitterY, TILE / 2 + 2, emitterY, x0 + W - 4, y0 + H, x0 + 4, y0 + H]).fill({ color: cyan, alpha: 0.1 * flicker })
    g.rect(x0, y0, W, H).fill({ color: 0x0a3a50, alpha: 0.55 * flicker })
    for (let y = 0; y < H; y += 2) g.rect(x0, y0 + y, W, 1).fill({ color: cyan, alpha: 0.06 })
    // Corner brackets: two 4px strokes at each corner of the projection.
    for (const [cx, cy, sx, sy] of [[x0, y0, 1, 1], [x0 + W - 1, y0, -1, 1], [x0, y0 + H - 1, 1, -1], [x0 + W - 1, y0 + H - 1, -1, -1]] as const) {
      g.rect(sx > 0 ? cx : cx - 3, cy, 4, 1).fill({ color: cyan, alpha: 0.95 })
      g.rect(cx, sy > 0 ? cy : cy - 3, 1, 4).fill({ color: cyan, alpha: 0.95 })
    }
    g.rect(x0 + 2, y0 + 9, W - 4, 1).fill({ color: cyan, alpha: 0.4 })
    const scroll = Math.floor(t / 90)
    for (let row = 0; row < 6; row++) {
      const n = scroll + row
      const len = 6 + ((n * 13) % (W - 12))
      const glitch = n % 17 === 0 ? 1 : 0
      g.rect(x0 + 3 + glitch, y0 + 11 + row * 2, len, 1).fill({ color: n % 5 === 0 ? 0x8aff9a : cyan, alpha: 0.85 * flicker })
    }
    const progress = (t / 1800) % 1
    g.rect(x0 + 3, y0 + H - 4, W - 6, 1).fill({ color: cyan, alpha: 0.25 })
    g.rect(x0 + 3, y0 + H - 4, Math.round((W - 6) * progress), 1).fill({ color: 0x8aff9a, alpha: 0.9 })
    const cmd = (this.detail ?? 'running').replace(/\s+/g, ' ').slice(0, 11)
    this.caption(cmd, cyan, x0 + 3, y0 + 2)
  }

  // A small web of thoughts orbiting the head, lighting up one link at a time.
  private drawThought(g: Graphics, t: number) {
    const cx = TILE / 2
    // At a desk the web floats above the monitor rather than over it.
    const cy = this.seated && this.goal.facing === 'up' ? this.top - 30 : this.top - 8
    const nodes = 5
    const spin = t / 900
    const lit = Math.floor(t / 180) % nodes
    for (let i = 0; i < nodes; i++) {
      const a = spin + (i * Math.PI * 2) / nodes
      const nx = Math.round(cx + Math.cos(a) * 8)
      const ny = Math.round(cy + Math.sin(a) * 4)
      const on = i === lit
      const steps = 6
      for (let k = 1; k < steps; k++) g.rect(Math.round(cx + ((nx - cx) * k) / steps), Math.round(cy + ((ny - cy) * k) / steps), 1, 1).fill({ color: 0xb08aff, alpha: on ? 0.9 : 0.25 })
      g.rect(nx - 1, ny - 1, 3, 3).fill({ color: 0x14111c, alpha: 0.6 })
      g.rect(nx, ny, 1, 1).fill(on ? 0xffffff : 0x9ad8ff)
    }
    const pulse = Math.floor(t / 300) % 2
    g.rect(cx - 1 - pulse, cy - 1 - pulse, 3 + pulse * 2, 3 + pulse * 2).fill({ color: 0xb08aff, alpha: 0.5 })
    g.rect(cx, cy, 1, 1).fill(0xffffff)
  }

  // A page floating beside the agent fills line by line; the file being written is named above it.
  private drawWriting(g: Graphics, t: number) {
    const cycle = 2600
    const p = (t % cycle) / cycle
    const x0 = TILE + 1
    const y0 = this.top - 14 - Math.round(p * 3)
    const W = 14
    const H = 16
    g.rect(x0 - 1, y0 - 1, W + 2, H + 2).fill({ color: 0x14111c, alpha: 0.8 })
    g.rect(x0, y0, W, H).fill({ color: 0xf8f6ee, alpha: 0.95 })
    const lines = 6
    const done = p * lines
    for (let i = 0; i < lines; i++) {
      const full = [10, 8, 11, 6, 9, 7][i]!
      const len = i < Math.floor(done) ? full : i === Math.floor(done) ? Math.round(full * (done % 1)) : 0
      if (len > 0) g.rect(x0 + 2, y0 + 3 + i * 2, len, 1).fill(i === 0 ? 0x4a6ad0 : 0x5a5a6a)
      if (i === Math.floor(done)) g.rect(x0 + 2 + len, y0 + 2 + i * 2, 1, 3).fill(0xd83a3a)
    }
    const name = (this.detail ?? 'writing').slice(0, 10)
    this.caption(name, 0xf6e27a, x0, y0 - 7)
  }

  private drawBubble(t: number) {
    const show = this.activity !== 'idle' && !this.effect() && !this.quiet()
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
    // Facing a desk, the bubble moves beside the head so it never covers the monitor.
    const atDesk = this.seated && this.goal.facing === 'up'
    this.bubble.x = atDesk ? TILE + 6 : TILE / 2
    this.bubble.y = (atDesk ? this.top + 4 : this.top - 7) + this.bubbleDy + Math.round(Math.sin(t / 400))
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

  /** A small glyph in the mode's colour to the left of the name: pencil, list, bolt, lock or skull. */
  private drawBadge() {
    const mi = this.mode && this.mode !== 'default' ? modeInfo(this.mode) : null
    const key = mi?.id ?? ''
    if (key === this.badgeMode) return
    this.badgeMode = key
    this.badge.removeChildren().forEach((c) => c.destroy())
    if (!mi?.glyph) return
    const bg = new Graphics()
    bg.rect(0, 0, 7, TAG_H).fill({ color: 0x0c0a12, alpha: 0.9 })
    bg.rect(0, TAG_H - 1, 7, 1).fill(mi.color)
    const glyph = new Sprite(pixelTexture(mi.glyph, { '#': mi.color }, `mode/${mi.id}`))
    glyph.x = 1
    glyph.y = 0
    this.badge.addChild(bg, glyph)
    this.badge.x = -8
  }

  private drawTag() {
    const color = labelColor(this.role, this.selected)
    const text = this.tagLabel()
    const w = this.tagWidth()
    if (color !== this.tagColor || text !== this.tagShown) {
      this.tagColor = color
      this.tagShown = text
      this.tagText.texture = pixelTexture(textPixels(text), { '#': color }, `label/${text}/${color}`)
      this.tagBg.clear()
      this.tagBg.rect(0, 0, w, TAG_H).fill({ color: 0x0c0a12, alpha: 0.82 })
      this.tagText.x = 2
      this.tagText.y = 1
    }
    this.tag.visible = this.tagShownNow
    this.drawBadge()
    this.tag.x = TILE / 2 - Math.floor(w / 2)
    this.tag.y = TILE + 1 + this.tagDy
    // Context gauge along the bottom of the name tag: how full this agent's context window is.
    const g = this.gauge
    g.clear()
    if (this.contextPct !== null) {
      const pct = Math.max(0, Math.min(100, this.contextPct))
      g.rect(0, TAG_H, w, 2).fill(0x0c0a12)
      g.rect(0, TAG_H, Math.max(1, Math.round((w * pct) / 100)), 1).fill(pct > 80 ? 0xd83a3a : pct > 60 ? 0xf2c230 : 0x5f9e5f)
    }
  }
}
