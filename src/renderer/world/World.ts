// Our CSP forbids eval; this swaps Pixi's generated shaders/uniform code for precompiled paths.
import 'pixi.js/unsafe-eval'
import { Application, Container, Graphics, TextureSource } from 'pixi.js'
import type { Activity } from '../../shared/types'
import { Character } from './character'
import { paletteFor } from './sprites'
import { type Ambient, type Screen, drawFloors, drawFurniture } from './furniture'
import { GRASS, Street, drawGrounds, drawHiringSign } from './grounds'
import { Dock, type DockHandlers, type DockItem } from './dock'
import { PLANT, PowerPlant } from './power'
import type { DockStatus } from '../../shared/api'
import type { LimitView, UsageLimits } from '../../shared/usage'
import { OFFICE, type Spot, TILE } from './office'
import { spread } from './overlap'
import { type AgentState, type Place, placeFor, roleOf } from './worldState'

TextureSource.defaultOptions.scaleMode = 'nearest'

export interface AgentView {
  id: string
  name: string
  state: AgentState
  selected: boolean
  /** Messages from other agents waiting for this one to finish its turn. */
  inbox: number
  /** Share of the context window used, from Claude's statusline feed; null until the first update. */
  contextPct: number | null
}

export type WorldHandlers = { plant: PlantHandlers; dock: DockHandlers }
export interface PlantHandlers {
  onHover: (v: { five: LimitView; week: LimitView } | null, x: number, y: number) => void
}

interface Flight {
  from: { x: number; y: number }
  to: { x: number; y: number }
  start: number
}
const FLIGHT_MS = 1400

type Purpose = Exclude<Place, 'gone'>

const POOLS: Record<Purpose, Spot[]> = {
  desk: [...OFFICE.desks, ...OFFICE.overflow.desk],
  intern: [...OFFICE.interns, ...OFFICE.overflow.intern],
  lounge: [...OFFICE.sofas, ...OFFICE.overflow.lounge],
  whiteboard: [...OFFICE.whiteboard, ...OFFICE.overflow.desk]
}
const MAX_PILE = 14
// Art pixels kept in view above the building (the power plant) and below it (the street with the delivery vans).
const BAND = { north: 56, south: 70 }
const MIN_ZOOM = 2
const MAX_ZOOM = 8
const DRAG_THRESHOLD = 4
// The coffee machine's spout, for the steam effect.
const COFFEE_SPOUT = { x: 22 * TILE + 55, y: 15 * TILE - 13 }

export class OfficeWorld {
  private readonly chars = new Map<string, Character>()
  private readonly claims = new Map<Purpose, Map<string, Spot>>()
  private screens = new Map<string, Screen>()
  private readonly piles = new Map<string, Graphics>()
  private readonly files = new Map<string, number>()
  private readonly inbox = new Map<string, number>()
  private readonly flights: Flight[] = []
  private street!: Street
  private plant!: PowerPlant
  private dock!: Dock
  private readonly sign = drawHiringSign(OFFICE.map)
  private readonly mail = new Graphics()
  private readonly board = new Graphics()
  private boardKey = ''
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
    private readonly host: HTMLElement,
    private readonly onSelect: (agentId: string) => void
  ) {}

  static async create(el: HTMLElement, onSelect: (agentId: string) => void, handlers: WorldHandlers) {
    const app = new Application()
    await app.init({ resizeTo: el, background: GRASS, antialias: false, autoDensity: true, resolution: window.devicePixelRatio })
    el.appendChild(app.canvas)
    const w = new OfficeWorld(app, el, (id) => {
      // A pan that ends over a character is not a click on it.
      if (!w.dragged) onSelect(id)
    })
    w.build(handlers)
    // resizeTo only follows window resizes; the stage also changes size when the side panel toggles.
    w.observer = new ResizeObserver(() => app.resize())
    w.observer.observe(el)
    return w
  }

  private build(handlers: WorldHandlers) {
    const shadows = new Graphics()
    this.street = new Street(OFFICE.map)
    this.plant = new PowerPlant(OFFICE.map.w * TILE - PLANT.w - 14, -PLANT.h - 1, handlers.plant)
    // Vans park along the near kerb of the street, under the building.
    this.dock = new Dock({ x: 20, y: OFFICE.map.h * TILE + 8 + 22 + 3, width: OFFICE.map.w * TILE - 40 }, handlers.dock, () => this.dragged)
    this.root.addChild(drawGrounds(OFFICE.map), this.plant.view, this.sign, this.dock.view, this.street.view, drawFloors(OFFICE.map), shadows, this.layer, this.overlays)
    this.overlays.addChild(this.mail)
    this.board.zIndex = TILE * 2
    this.layer.addChild(this.board)
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
    const dpr = this.app.renderer.resolution
    const W = this.app.screen.width * dpr
    const H = this.app.screen.height * dpr
    // Fit the building plus the strips of lawn and street that hold the power plant and the delivery vans.
    const fit = Math.max(1, Math.floor(Math.min(W / (OFFICE.map.w * TILE), H / (OFFICE.map.h * TILE + BAND.north + BAND.south))))
    return this.zoom ?? fit
  }

  // Integer scale in *device* pixels keeps every art pixel the same size on HiDPI screens.
  private layout() {
    const { width, height } = this.app.screen
    const dpr = this.app.renderer.resolution
    const worldW = OFFICE.map.w * TILE
    const worldH = OFFICE.map.h * TILE
    const scale = this.deviceScale() / dpr
    // The centre of building-plus-strips sits at the centre of the stage.
    const focusY = (worldH + BAND.south - BAND.north) / 2
    const limitX = (worldW * scale) / 2
    const limitY = ((worldH + BAND.north + BAND.south) * scale) / 2
    this.pan.x = Math.max(-limitX, Math.min(limitX, this.pan.x))
    this.pan.y = Math.max(-limitY, Math.min(limitY, this.pan.y))
    this.root.scale.set(scale)
    this.root.x = Math.round(((width - worldW * scale) / 2 + this.pan.x) * dpr) / dpr
    this.root.y = Math.round((height / 2 - focusY * scale + this.pan.y) * dpr) / dpr
    this.publishAnchors()
  }

  /** Screen positions of things drawn on the canvas, so the page (and tests) can anchor to them. */
  private publishAnchors() {
    this.host.dataset.power = JSON.stringify(this.plant.center())
    this.host.dataset.docks = JSON.stringify(this.dock.positions())
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
    const place = placeFor(activity, intern)
    const start = this.firstSync && place !== 'gone' ? this.claim(key, place) : OFFICE.door
    const c = new Character(key, label, role, home, start, OFFICE.map, () => this.onSelect(agentId))
    this.chars.set(key, c)
    this.layer.addChild(c.view)
    this.overlays.addChild(c.overlay)
    return c
  }

  private route(c: Character, activity: Activity, intern: boolean, detail?: string, mode?: string) {
    c.activity = activity
    c.detail = detail
    const place = placeFor(activity, intern, mode)
    if (place === 'gone') return
    c.goTo(place === 'desk' || place === 'intern' ? c.home : this.claim(c.key, place))
  }

  sync(agents: AgentView[]) {
    // The more agents are working, the busier the street.
    this.street.setBusy(agents.filter((a) => ['thinking', 'researching', 'implementing', 'running', 'delegating', 'compacting'].includes(a.state.activity)).length)
    const live = new Set<string>()
    this.files.clear()
    this.inbox.clear()
    for (const a of agents) {
      // A session that is not running is out of the office until it is woken or re-hired.
      if (placeFor(a.state.activity, false) === 'gone') continue
      live.add(a.id)
      const c = this.ensure(a.id, a.name, 'senior', a.id, a.state.activity)
      c.role = roleOf(a.state)
      c.selected = a.selected
      c.contextPct = a.contextPct
      this.route(c, a.state.activity, false, a.state.detail, a.state.mode)
      this.files.set(a.id, a.state.files)
      this.inbox.set(a.id, a.inbox)

      for (const [iid, intern] of Object.entries(a.state.interns)) {
        const key = `${a.id}/${iid}`
        live.add(key)
        const ic = this.ensure(key, intern.type, 'intern', a.id, intern.activity)
        ic.selected = a.selected
        this.route(ic, intern.activity, true, intern.detail)
      }
    }
    for (const [key, c] of this.chars)
      if (!live.has(key) && !c.leaving) {
        c.leaving = true
        c.activity = 'idle'
        this.release(key)
        c.goTo(OFFICE.door)
      }
    this.drawBoard(agents)
    this.firstSync = false
  }

  /**
   * The kanban board shows every agent's live task list as sticky notes in that agent's colour (to do, doing,
   * done). An agent with a plan but no tasks yet shows its plan steps in "to do".
   */
  private drawBoard(agents: AgentView[]) {
    const cols: { color: number; dim: boolean }[][] = [[], [], []]
    for (const a of agents) {
      if (placeFor(a.state.activity, false) === 'gone') continue
      const color = paletteFor(a.id, 'senior').c
      const tasks = a.state.tasks ?? []
      if (tasks.length) for (const t of tasks) cols[t.status === 'pending' ? 0 : t.status === 'in_progress' ? 1 : 2]!.push({ color, dim: false })
      else for (const _ of a.state.planSteps ?? []) cols[0]!.push({ color, dim: true })
    }
    const key = JSON.stringify(cols)
    if (key === this.boardKey) return
    this.boardKey = key
    const g = this.board
    g.clear()
    const bx = OFFICE.kanban.x * TILE
    const by = OFFICE.kanban.y * TILE
    const colW = Math.floor((OFFICE.kanban.w * TILE - 8) / 3)
    const PER_ROW = 3
    const MAX = PER_ROW * 3
    cols.forEach((col, c) =>
      col.slice(0, MAX).forEach((n, i) => {
        const x = bx + 5 + c * colW + (i % PER_ROW) * 7
        const y = by + 11 + Math.floor(i / PER_ROW) * 5
        g.rect(x, y, 6, 4).fill(n.color)
        // Plan steps are proposals, not tasks yet: drawn hollow.
        if (n.dim) g.rect(x + 1, y + 1, 4, 2).fill(0xf2f4f8)
        else g.rect(x, y, 6, 1).fill({ color: 0xffffff, alpha: 0.35 })
      })
    )
  }

  private tick(dt: number) {
    const t = performance.now()
    const atScreen = new Map<string, Activity>()
    for (const [key, c] of this.chars) {
      c.update(dt, t)
      if (c.leaving && c.arrived) {
        c.view.destroy({ children: true })
        c.overlay.destroy({ children: true })
        this.chars.delete(key)
        continue
      }
      if (c.arrived) atScreen.set(`${c.at.x},${c.at.y}`, c.activity)
    }
    this.drawPiles()
    this.drawMail(t)
    this.untangle()
    for (const [spot, s] of this.screens) s.draw(atScreen.get(spot) ?? null, t)
    this.ambient.update(t)
    this.sign.visible = this.chars.size === 0
    this.street.update(dt, t)
    this.plant.update(t)
    this.dock.update(t)
  }

  // Each written or edited file is a sheet on the owner's desk; a second pile starts when the first is full.
  private drawPiles() {
    const owners = new Map<string, number>()
    for (const [key, count] of this.files) {
      const c = this.chars.get(key)
      if (c && count > 0 && OFFICE.desks.includes(c.home)) owners.set(`${c.home.x},${c.home.y - 1}`, count)
    }
    for (const [desk, g] of this.piles) if (!owners.has(desk)) g.clear()
    for (const [desk, count] of owners) {
      let g = this.piles.get(desk)
      const [dx, dy] = desk.split(',').map(Number) as [number, number]
      if (!g) {
        g = new Graphics()
        // Above this desk's art, below the agent sitting at it.
        g.zIndex = (dy + 1) * TILE + 0.5
        this.layer.addChild(g)
        this.piles.set(desk, g)
      }
      g.clear()
      for (let pile = 0; pile * MAX_PILE < Math.min(count, MAX_PILE * 2); pile++) {
        const sheets = Math.min(MAX_PILE, count - pile * MAX_PILE)
        const x = dx * TILE + 2 + pile * 6
        // Sheet edges read as stacked paper: pale 1px edges with ink only down the sides and under the pile.
        const bottom = dy * TILE + 11
        g.rect(x - 1, bottom, 8, 1).fill(0x14111c)
        for (let i = 0; i < sheets; i++) {
          const y = bottom - 1 - i
          const skew = i % 3 === 1 ? 1 : 0
          g.rect(x - 1 + skew, y, 1, 1).fill(0x14111c)
          g.rect(x + 6 + skew, y, 1, 1).fill(0x14111c)
          g.rect(x + skew, y, 6, 1).fill(i % 2 ? 0xe4ddc4 : 0xfaf8f0)
        }
        g.rect(x - 1, bottom - sheets - 1, 8, 1).fill(0x14111c)
        g.rect(x, bottom - sheets, 6, 1).fill(0xffffff)
      }
    }
  }

  /** The subscription's remaining limits, shown as the tanks on the back lawn. */
  setLimits(l: UsageLimits) {
    this.plant.setLimits(l)
  }

  /** Unmerged work per agent, shown as delivery vans on the street. */
  setDock(list: DockStatus[]) {
    this.dock.setItems(list.map((d): DockItem => ({ ...d, color: paletteFor(d.agentId, 'senior').c })))
    this.publishAnchors()
  }

  /** An envelope flies from sender to recipient; it's how one agent visibly asks another for something. */
  sendMail(fromId: string, toId: string) {
    const a = this.chars.get(fromId)
    const b = this.chars.get(toId)
    if (!a || !b) return
    const head = (c: Character) => ({ x: c.view.x + TILE / 2, y: c.view.y - 4 })
    this.flights.push({ from: head(a), to: head(b), start: performance.now() })
  }

  private drawMail(t: number) {
    const g = this.mail
    g.clear()
    const envelope = (x: number, y: number, alpha = 1) => {
      g.rect(x - 4, y - 3, 9, 7).fill({ color: 0x14111c, alpha })
      g.rect(x - 3, y - 2, 7, 5).fill({ color: 0xf8f6ee, alpha })
      g.rect(x - 2, y - 1, 1, 1).fill({ color: 0xd83a3a, alpha })
      g.rect(x - 1, y, 3, 1).fill({ color: 0xb0aa98, alpha })
      g.rect(x + 2, y - 1, 1, 1).fill({ color: 0xd83a3a, alpha })
    }
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i]!
      const p = (t - f.start) / FLIGHT_MS
      if (p >= 1) {
        this.flights.splice(i, 1)
        continue
      }
      const ease = 1 - (1 - p) ** 2
      const x = f.from.x + (f.to.x - f.from.x) * ease
      const lift = Math.sin(p * Math.PI) * 28
      const y = f.from.y + (f.to.y - f.from.y) * ease - lift
      for (let k = 1; k <= 4; k++) g.rect(Math.round(x - (f.to.x - f.from.x) * 0.03 * k), Math.round(y + k * 2), 1, 1).fill({ color: 0xf6e27a, alpha: 0.6 - k * 0.12 })
      envelope(Math.round(x), Math.round(y))
    }
    // Waiting mail stacks beside the recipient until its turn ends.
    for (const [id, count] of this.inbox) {
      const c = this.chars.get(id)
      if (!c || count === 0) continue
      for (let i = 0; i < Math.min(count, 4); i++) envelope(c.view.x - 4, c.view.y + 4 - i * 3)
    }
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
