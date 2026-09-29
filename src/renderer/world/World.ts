// Our CSP forbids eval; this swaps Pixi's generated shaders/uniform code for precompiled paths.
import 'pixi.js/unsafe-eval'
import { Application, Container, Graphics, TextureSource } from 'pixi.js'
import type { Activity } from '../../shared/types'
import { Character } from './character'
import { type Ambient, type Screen, drawExterior, drawFloors, drawFurniture } from './furniture'
import { OFFICE, type Spot, TILE } from './office'
import { spread } from './overlap'
import { type AgentState, roleOf } from './worldState'

TextureSource.defaultOptions.scaleMode = 'nearest'

export interface AgentView {
  id: string
  name: string
  state: AgentState
  selected: boolean
}

type Purpose = 'desk' | 'intern' | 'lounge' | 'console' | 'coffee' | 'boss'

const POOLS: Record<Purpose, Spot[]> = {
  desk: [...OFFICE.desks, ...OFFICE.overflow.desk],
  intern: [...OFFICE.interns, ...OFFICE.overflow.intern],
  lounge: [...OFFICE.sofas, ...OFFICE.overflow.lounge],
  console: [...OFFICE.consoles, ...OFFICE.overflow.console],
  coffee: [...OFFICE.coffee, ...OFFICE.overflow.coffee],
  boss: OFFICE.bossHeads
}
const EXTERIOR_MARGIN = 24
const MIN_ZOOM = 2
const MAX_ZOOM = 8
const DRAG_THRESHOLD = 4
// The coffee machine's spout, for the steam effect.
const COFFEE_SPOUT = { x: 22 * TILE + 55, y: 15 * TILE - 13 }

function purposeFor(activity: Activity, intern: boolean): Purpose {
  if (activity === 'running') return 'console'
  if (intern) return 'intern'
  if (activity === 'waiting') return 'coffee'
  if (activity === 'idle' || activity === 'asleep') return 'lounge'
  if (activity === 'delegating') return 'boss'
  return 'desk'
}

export class OfficeWorld {
  private readonly chars = new Map<string, Character>()
  private readonly claims = new Map<Purpose, Map<string, Spot>>()
  private screens = new Map<string, Screen>()
  private ambient!: Ambient
  private readonly root = new Container()
  private readonly layer = new Container({ sortableChildren: true })
  private readonly overlays = new Container()
  private firstSync = true
  private zoom: number | null = null
  private pan = { x: 0, y: 0 }
  private drag: { x: number; y: number; moved: boolean } | null = null
  private dragged = false
  private observer: ResizeObserver | null = null

  private constructor(
    private readonly app: Application,
    private readonly onSelect: (agentId: string) => void
  ) {}

  static async create(el: HTMLElement, onSelect: (agentId: string) => void) {
    const app = new Application()
    await app.init({ resizeTo: el, background: 0x12101a, antialias: false, autoDensity: true, resolution: window.devicePixelRatio })
    el.appendChild(app.canvas)
    const w = new OfficeWorld(app, (id) => {
      // A pan that ends over a character is not a click on it.
      if (!w.dragged) onSelect(id)
    })
    w.build()
    // resizeTo only follows window resizes; the stage also changes size when the side panel toggles.
    w.observer = new ResizeObserver(() => app.resize())
    w.observer.observe(el)
    return w
  }

  private build() {
    const shadows = new Graphics()
    this.root.addChild(drawExterior(OFFICE.map, EXTERIOR_MARGIN), drawFloors(OFFICE.map), shadows, this.layer, this.overlays)
    const f = drawFurniture(OFFICE.furniture, OFFICE.decor, this.layer, shadows, COFFEE_SPOUT)
    this.screens = f.screens
    this.ambient = f.ambient
    this.app.stage.addChild(this.root)
    this.app.ticker.add((tk) => this.tick(tk.deltaMS))
    this.app.renderer.on('resize', () => this.layout())
    this.bindCamera()
    this.layout()
  }

  private bindCamera() {
    const stage = this.app.stage
    stage.eventMode = 'static'
    stage.hitArea = this.app.screen
    this.app.canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        const current = this.deviceScale()
        this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current + (e.deltaY < 0 ? 1 : -1)))
        this.layout()
      },
      { passive: false }
    )
    stage.on('pointerdown', (e) => {
      this.drag = { x: e.global.x, y: e.global.y, moved: false }
    })
    stage.on('pointermove', (e) => {
      if (!this.drag) return
      const dx = e.global.x - this.drag.x
      const dy = e.global.y - this.drag.y
      if (!this.drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      this.drag.moved = true
      this.dragged = true
      this.pan.x += dx
      this.pan.y += dy
      this.drag.x = e.global.x
      this.drag.y = e.global.y
      this.layout()
    })
    const end = () => {
      this.drag = null
      // pointertap fires after pointerup; clear the flag once that tap has been ignored.
      setTimeout(() => (this.dragged = false), 0)
    }
    stage.on('pointerup', end)
    stage.on('pointerupoutside', end)
  }

  private deviceScale() {
    const { width, height } = this.app.screen
    const dpr = this.app.renderer.resolution
    const fit = Math.max(1, Math.floor(Math.min((width * dpr) / (OFFICE.map.w * TILE), (height * dpr) / (OFFICE.map.h * TILE))))
    // Default shows the whole office; the wheel zooms past that when the user wants detail.
    return this.zoom ?? fit
  }

  // Integer scale in *device* pixels keeps every art pixel the same size on HiDPI screens.
  private layout() {
    const { width, height } = this.app.screen
    const dpr = this.app.renderer.resolution
    const worldW = OFFICE.map.w * TILE
    const worldH = OFFICE.map.h * TILE
    const scale = this.deviceScale() / dpr
    // Keep the building's centre on screen however far the user pans.
    const limitX = (worldW * scale) / 2
    const limitY = (worldH * scale) / 2
    this.pan.x = Math.max(-limitX, Math.min(limitX, this.pan.x))
    this.pan.y = Math.max(-limitY, Math.min(limitY, this.pan.y))
    this.root.scale.set(scale)
    this.root.x = Math.round(((width - worldW * scale) / 2 + this.pan.x) * dpr) / dpr
    this.root.y = Math.round(((height - worldH * scale) / 2 + this.pan.y) * dpr) / dpr
  }

  // Desk and intern seats are permanent homes; every other spot is borrowed while in use.
  private claim(key: string, purpose: Purpose): Spot {
    for (const [p, m] of this.claims) if (p !== purpose && p !== 'desk' && p !== 'intern') m.delete(key)
    const mine = this.claims.get(purpose) ?? new Map<string, Spot>()
    this.claims.set(purpose, mine)
    const held = mine.get(key)
    if (held) return held
    const taken = [...mine.values()]
    const pool = POOLS[purpose]
    const spot = pool.find((s) => !taken.some((t) => t.x === s.x && t.y === s.y)) ?? pool[pool.length - 1]!
    mine.set(key, spot)
    return spot
  }

  private release(key: string) {
    for (const m of this.claims.values()) m.delete(key)
  }

  private ensure(key: string, label: string, role: 'senior' | 'intern', agentId: string, activity: Activity) {
    const existing = this.chars.get(key)
    if (existing) return existing
    const intern = role === 'intern'
    const home = this.claim(key, intern ? 'intern' : 'desk')
    const start = this.firstSync ? this.claim(key, purposeFor(activity, intern)) : OFFICE.door
    const c = new Character(key, label, role, home, start, OFFICE.map, () => this.onSelect(agentId))
    this.chars.set(key, c)
    this.layer.addChild(c.view)
    this.overlays.addChild(c.overlay)
    return c
  }

  private route(c: Character, activity: Activity, intern: boolean) {
    c.activity = activity
    const purpose = purposeFor(activity, intern)
    c.goTo(purpose === 'desk' || purpose === 'intern' ? c.home : this.claim(c.key, purpose))
  }

  sync(agents: AgentView[]) {
    const live = new Set<string>()
    for (const a of agents) {
      live.add(a.id)
      const c = this.ensure(a.id, a.name, 'senior', a.id, a.state.activity)
      c.role = roleOf(a.state)
      c.selected = a.selected
      this.route(c, a.state.activity, false)

      for (const [iid, intern] of Object.entries(a.state.interns)) {
        const key = `${a.id}/${iid}`
        live.add(key)
        const ic = this.ensure(key, intern.type, 'intern', a.id, intern.activity)
        ic.selected = a.selected
        this.route(ic, intern.activity, true)
      }
    }
    for (const [key, c] of this.chars)
      if (!live.has(key) && !c.leaving) {
        c.leaving = true
        c.activity = 'idle'
        this.release(key)
        c.goTo(OFFICE.door)
      }
    this.firstSync = false
  }

  private tick(dt: number) {
    const t = performance.now()
    const atScreen = new Map<string, Activity>()
    let coffeeBusy = false
    for (const [key, c] of this.chars) {
      c.update(dt, t)
      if (c.leaving && c.arrived) {
        c.view.destroy({ children: true })
        c.overlay.destroy({ children: true })
        this.chars.delete(key)
        continue
      }
      if (c.arrived) atScreen.set(`${c.at.x},${c.at.y}`, c.activity)
      if (OFFICE.coffee.some((s) => c.isAt(s))) coffeeBusy = true
    }
    this.untangle()
    for (const [spot, s] of this.screens) s.draw(atScreen.get(spot) ?? null, t)
    this.ambient.update(t, coffeeBusy)
  }

  // Tags push downward and bubbles upward until none cover another.
  private untangle() {
    const chars = [...this.chars.values()]
    const tagBoxes = chars.map((c) => c.tagBox)
    const tags = spread(tagBoxes, 1)
    const placedTags = tagBoxes.map((b) => ({ ...b, id: `tag:${b.id}`, y: b.y + (tags[b.id] ?? 0) }))
    const bubbles = spread(chars.flatMap((c) => c.bubbleBox ?? []), -1, placedTags)
    for (const c of chars) {
      c.tagDy = tags[c.key] ?? 0
      c.bubbleDy = bubbles[c.key] ?? 0
    }
  }

  destroy() {
    this.observer?.disconnect()
    this.app.destroy(true, { children: true })
  }
}
