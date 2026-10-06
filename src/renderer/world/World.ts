// Our CSP forbids eval; this swaps Pixi's generated shaders/uniform code for precompiled paths.
import 'pixi.js/unsafe-eval'
import { Application, Container, Graphics, TextureSource, Ticker } from 'pixi.js'
import type { Activity } from '../../shared/types'
import { RUSH, type Lot, carDoorPoint } from './arrival'
import { Fleet, type FleetEvent } from './fleet'
import { FPS, MOVING_MS, frameCap } from './frameRate'
import { Shouts } from './shouts'
import { VisitorsView } from './visitors'
import { Character } from './character'
import { paletteFor } from './sprites'
import { type Ambient, type Screen, drawFloors, drawFurniture } from './furniture'
import { CAR_COLORS, GRASS, GROUNDS, Street, drawGrounds, drawHiringSign, paintBillboard, paintScoreboard } from './grounds'
import { scoreboardRows } from './scoreboard'
import { PLANT, PowerPlant } from './power'
import type { LimitView, UsageLimits } from '../../shared/usage'
import { OFFICE, RETINUE_SEATS, type Spot, TILE, retinueSpot } from './office'
import { spread } from './overlap'
import { type AgentState, type Place, placeFor, roleOf } from './worldState'

TextureSource.defaultOptions.scaleMode = 'nearest'

// The street in front of the entrance, for the cars that bring subagents (see arrival.ts).
const MAP_W = OFFICE.map.w * TILE
const MAP_H = OFFICE.map.h * TILE
const LOT: Lot = { doorX: OFFICE.door.x * TILE + OFFICE.door.ox + TILE / 2, laneY: MAP_H + 40, slotY: MAP_H + 18, left: -GROUNDS.west - 40, right: MAP_W + GROUNDS.east + 40 }
/** Where a person is when they are at the door on the pavement side (feet y). */
const FRONT_OF_DOOR = { x: LOT.doorX, y: MAP_H + 14 }
const calmMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

export interface AgentView {
  id: string
  name: string
  state: AgentState
  selected: boolean
  /** Messages from other agents waiting for this one to finish its turn. */
  inbox: number
  /** Share of the context window used, from Claude's statusline feed; null until the first update. */
  contextPct: number | null
  /** The agent this one was cloned from: it takes the free desk nearest to that one. */
  cloneOf?: string
  /** Lines added and removed this session, from Claude's statusline feed. */
  linesChanged: number
}

export type WorldHandlers = { plant: PlantHandlers; handbook: (agentId: string) => void }
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
// Art pixels kept in view above the building (the power plant) and below it (the pavement and street).
const BAND = { north: 56, south: 44 }
const MIN_ZOOM = 1
const MAX_ZOOM = 10
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
  // Subagents come and go by car: where the cars are, how they are drawn, and who is in one.
  private readonly fleet = new Fleet(LOT)
  private readonly shouts = new Shouts()
  private readonly visitors = new VisitorsView(this.fleet, this.shouts)
  private publishedVisits = ''
  private publishedShouts = ''
  private onHandbook: (agentId: string) => void = () => {}
  private readonly books = new Map<string, Graphics>()
  // Subagents gathered around their main agent's desk: which seat each has, and the stool drawn under it.
  private readonly retinue = new Map<string, number>()
  private readonly stools = new Map<string, Graphics>()
  private publishedBooks = -1
  private publishedCrew = ''
  private plant!: PowerPlant
  private readonly sign = drawHiringSign(OFFICE.map)
  private readonly billboard = new Graphics()
  private readonly scoreboard = new Graphics()
  private publishedScore = ''
  private readonly mail = new Graphics()
  private readonly board = new Graphics()
  private boardKey = ''
  private ambient!: Ambient
  private readonly root = new Container()
  private readonly layer = new Container({ sortableChildren: true })
  private readonly overlays = new Container()
  private firstSync = true
  private zoom: number | null = null
  private mode: 'scene' | 'office' = 'scene'
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
    // Pixi starts two more tickers of its own: a shared one nothing here uses, and a system one that its renderer's scheduler (texture clean-up)
    // runs on. Left alone they ask for a frame at every screen refresh, 120 a second here, which keeps the compositor and GPU awake all day.
    // Both are stopped; drive() advances the system one along with the office.
    Ticker.shared.autoStart = false
    Ticker.shared.stop()
    Ticker.system.autoStart = false
    Ticker.system.stop()
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
    this.onHandbook = handlers.handbook
    this.plant = new PowerPlant(OFFICE.map.w * TILE - PLANT.w - 14, -PLANT.h - 1, handlers.plant)
    this.root.addChild(drawGrounds(OFFICE.map), this.billboard, this.scoreboard, this.plant.view, this.sign, this.street.view, this.visitors.view, drawFloors(OFFICE.map), shadows, this.layer, this.overlays)
    this.overlays.addChild(this.mail, this.visitors.bubbles)
    this.board.zIndex = TILE * 2
    this.layer.addChild(this.board)
    const f = drawFurniture(OFFICE.furniture, OFFICE.decor, this.layer, shadows, COFFEE_SPOUT)
    this.screens = f.screens
    this.ambient = f.ambient
    this.app.stage.addChild(this.root)
    this.app.ticker.add((tk) => this.tick(tk.deltaMS))
    this.app.ticker.stop() // driven by pace() instead, see drive()
    this.pace()
    document.addEventListener('visibilitychange', this.repace)
    window.addEventListener('focus', this.repace)
    window.addEventListener('blur', this.repace)
    this.app.renderer.on('resize', () => this.layout())
    this.bindCamera()
    this.layout()
  }

  // The office is redrawn only as often as it is worth it: calm while in use, smooth while panning, slow with another app in front, stopped when hidden.
  private lastActive = -Infinity
  private paceTimer: ReturnType<typeof setTimeout> | undefined
  private readonly repace = () => this.pace()

  private touched() {
    this.lastActive = performance.now()
    this.pace()
  }

  private cap = -1
  private raf = 0
  private frameTimer: ReturnType<typeof setTimeout> | undefined

  /**
   * Pixi's own loop asks the browser for a frame at every screen refresh (120 a second here) just to decide to skip most of them,
   * and that alone keeps the compositor and the GPU awake. So the ticker is driven from here: by a timer at the calm and background
   * rates, which wakes the page only when it draws, and in step with the screen only while something moves.
   */
  private drive(cap: number) {
    cancelAnimationFrame(this.raf)
    clearTimeout(this.frameTimer)
    const t = this.app.ticker
    if (cap === 0) return
    if (cap >= FPS.moving) {
      t.maxFPS = cap
      const f = () => {
        this.raf = requestAnimationFrame(f)
        const now = performance.now()
        Ticker.system.update(now)
        t.update(now)
      }
      this.raf = requestAnimationFrame(f)
    } else {
      t.maxFPS = 0 // the timer sets the pace; a timer firing a hair early must not cost a whole frame
      const f = () => {
        this.frameTimer = setTimeout(f, 1000 / cap)
        const now = performance.now()
        Ticker.system.update(now)
        t.update(now)
      }
      this.frameTimer = setTimeout(f, 1000 / cap)
    }
  }

  private pace() {
    const cap = frameCap({ hidden: document.hidden, focused: document.hasFocus(), lastActive: this.lastActive, now: performance.now() })
    if (cap !== this.cap) {
      this.cap = cap
      this.drive(cap)
    }
    this.host.dataset.fpscap = String(cap)
    // Settle back to the calm rate once the last pan, zoom or step is over.
    clearTimeout(this.paceTimer)
    const since = performance.now() - this.lastActive
    if (cap > 0 && document.hasFocus() && since < MOVING_MS) this.paceTimer = setTimeout(this.repace, MOVING_MS + 50 - since)
  }

  private bindCamera() {
    const stage = this.app.stage
    stage.eventMode = 'static'
    stage.hitArea = this.app.screen
    this.app.canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        this.touched()
        this.zoomBy(e.deltaY < 0 ? 1 : -1)
      },
      { passive: false }
    )
    stage.on('pointerdown', (e) => {
      this.touched()
      this.drag = { x: e.global.x, y: e.global.y, moved: false }
    })
    stage.on('pointermove', (e) => {
      if (!this.drag) return
      const dx = e.global.x - this.drag.x
      const dy = e.global.y - this.drag.y
      if (!this.drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      this.touched()
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

  /** The scale that shows the building plus the strips of lawn and street around it, whole pixels per art pixel. */
  private sceneScale() {
    const dpr = this.app.renderer.resolution
    const W = this.app.screen.width * dpr
    const H = this.app.screen.height * dpr
    return Math.max(1, Math.floor(Math.min(W / (OFFICE.map.w * TILE), H / (OFFICE.map.h * TILE + BAND.north + BAND.south))))
  }

  /** The scale at which the office alone fills the window, edge to edge (with a small margin). */
  private officeScale() {
    const dpr = this.app.renderer.resolution
    const W = this.app.screen.width * dpr
    const H = this.app.screen.height * dpr
    const pad = 12
    return Math.max(1, Math.min(W / (OFFICE.map.w * TILE + pad), H / (OFFICE.map.h * TILE + pad)))
  }

  private deviceScale() {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom ?? this.sceneScale()))
  }

  /** One step in or out, to the next whole scale so art pixels stay even. */
  zoomBy(dir: 1 | -1) {
    const now = this.deviceScale()
    const next = dir > 0 ? Math.floor(now + 1e-6) + 1 : Math.ceil(now - 1e-6) - 1
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next))
    // Zooming about the middle of the view: the panned offset scales with the picture.
    this.pan.x *= clamped / now
    this.pan.y *= clamped / now
    this.zoom = clamped
    this.layout()
  }

  /** Fill the window with the office alone, centred. */
  fitOffice() {
    this.mode = 'office'
    this.pan = { x: 0, y: 0 }
    this.zoom = this.officeScale()
    this.layout()
  }

  /** Back to the default view of the office with its grounds. */
  resetView() {
    this.mode = 'scene'
    this.pan = { x: 0, y: 0 }
    this.zoom = null
    this.layout()
  }

  // Integer scale in *device* pixels keeps every art pixel the same size on HiDPI screens (the fit-to-office view is exact instead).
  private layout() {
    const { width, height } = this.app.screen
    const dpr = this.app.renderer.resolution
    const bw = OFFICE.map.w * TILE
    const bh = OFFICE.map.h * TILE
    const scale = this.deviceScale() / dpr
    // Where the view is centred, and the rectangle it may not leave (the office and its strips, plus a little).
    const focus = this.mode === 'office' ? { x: bw / 2, y: bh / 2 } : { x: bw / 2, y: (bh + BAND.south - BAND.north) / 2 }
    const area = { l: -48, r: bw + 48, t: -BAND.north - 24, b: bh + BAND.south + 24 }
    const axis = (view: number, f: number, lo: number, hi: number, pan: number) => {
      const centred = view / 2 - f * scale
      // Smaller than the view: keep it centred. Larger: it may slide, but never past its own edges.
      const root = (hi - lo) * scale <= view ? centred : Math.max(view - hi * scale, Math.min(-lo * scale, centred + pan))
      return { root, pan: root - centred }
    }
    const x = axis(width, focus.x, area.l, area.r, this.pan.x)
    const y = axis(height, focus.y, area.t, area.b, this.pan.y)
    this.pan = { x: x.pan, y: y.pan }
    this.root.scale.set(scale)
    this.root.x = Math.round(x.root * dpr) / dpr
    this.root.y = Math.round(y.root * dpr) / dpr
    this.publishAnchors()
  }

  /** Screen positions of things drawn on the canvas, so the page (and tests) can anchor to them. */
  // Where each gathered subagent sits and which way it faces, with its main agent's desk, for tests.
  private crewJson() {
    return JSON.stringify([...this.retinue].map(([key, seat]) => {
      const c = this.chars.get(key)!
      const parent = this.chars.get(key.split('/')[0]!)
      return { key, seat, x: c.home.x, y: c.home.y, facing: c.home.facing, desk: parent?.home ?? null, subagents: parent?.subagents ?? 0 }
    }))
  }

  private publishAnchors() {
    this.publishedBooks = this.books.size
    this.host.dataset.power = JSON.stringify(this.plant.center())
    this.host.dataset.books = JSON.stringify([...this.books].map(([agentId, g]) => { const p = g.getGlobalPosition(); const k = this.root.scale.x; return { agentId, x: Math.round(p.x + 4 * k), y: Math.round(p.y + 5 * k) } }))
    this.publishedCrew = this.crewJson()
    this.host.dataset.crew = this.publishedCrew
    this.host.dataset.view = JSON.stringify({ scale: this.root.scale.x, x: this.root.x, y: this.root.y })
  }

  // Desk and intern seats are permanent homes; every other spot is borrowed while in use.
  private claim(key: string, purpose: Purpose, near?: Spot): Spot {
    for (const [p, m] of this.claims) if (p !== purpose && p !== 'desk' && p !== 'intern') m.delete(key)
    const mine = this.claims.get(purpose) ?? new Map<string, Spot>()
    this.claims.set(purpose, mine)
    const held = mine.get(key)
    if (held) return held
    const taken = [...mine.values()]
    const pool = POOLS[purpose]
    const free = pool.filter((s) => !taken.some((t) => t.x === s.x && t.y === s.y))
    // A clone sits beside the one it came from.
    const away = (s: Spot) => Math.abs(s.x - near!.x) + Math.abs(s.y - near!.y)
    // Real desks first (the overflow spots are for when they run out), the nearest of those to the original.
    const desks = free.filter((s) => (purpose === 'desk' ? OFFICE.desks : pool).includes(s))
    const spot = (near ? [...(desks.length ? desks : free)].sort((a, b) => away(a) - away(b))[0] : free[0]) ?? pool[pool.length - 1]!
    mine.set(key, spot)
    return spot
  }

  private release(key: string) {
    this.retinue.delete(key)
    for (const m of this.claims.values()) m.delete(key)
  }

  private ensure(key: string, label: string, role: 'senior' | 'intern', agentId: string, activity: Activity, near?: Spot) {
    const existing = this.chars.get(key)
    if (existing) return existing
    const intern = role === 'intern'
    const gathered = intern ? this.retinueHome(agentId, key) : null
    const home = gathered ?? this.claim(key, intern ? 'intern' : 'desk', near)
    const place = placeFor(activity, intern)
    const start = this.firstSync && place !== 'gone' ? (gathered ?? this.claim(key, place)) : OFFICE.door
    const c = new Character(key, label, role, home, start, OFFICE.map, () => this.onSelect(agentId))
    // A subagent that starts while you watch arrives by car (out of sight until it has parked); with the parking full, or when
    // motion is turned down, it simply comes in at the door as before.
    if (intern && !this.firstSync && !calmMotion()) {
      // The agent that called for help shouts for it, once however many it called for at the same moment.
      this.shouts.say(`help:${agentId}`, 'HELP!', 1200, () => {
        const caller = this.chars.get(agentId)
        return caller ? { x: caller.view.x + TILE / 2, y: caller.view.y - 36 } : null
      })
      if (this.fleet.arrive(key, CAR_COLORS[[...key].reduce((n, ch) => n + ch.charCodeAt(0), 0) % CAR_COLORS.length]!)) c.waiting = true
    }
    this.chars.set(key, c)
    this.layer.addChild(c.view)
    this.overlays.addChild(c.overlay)
    return c
  }

  // A subagent sits beside the main agent's desk (the nearest free seat of six); with none left it uses the shared table.
  private retinueHome(parentId: string, key: string): Spot | null {
    const desk = this.chars.get(parentId)?.home
    if (!desk || !OFFICE.desks.includes(desk)) return null
    const used = new Set([...this.retinue].filter(([k]) => k.startsWith(`${parentId}/`)).map(([, i]) => i))
    const n = Array.from({ length: RETINUE_SEATS }, (_, i) => i).find((i) => !used.has(i))
    if (n === undefined) return null
    this.retinue.set(key, n)
    return retinueSpot(desk, n)
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
      const c = this.ensure(a.id, a.name, 'senior', a.id, a.state.activity, a.cloneOf ? this.chars.get(a.cloneOf)?.home : undefined)
      c.role = roleOf(a.state)
      c.selected = a.selected
      c.mode = a.state.mode
      c.contextPct = a.contextPct
      c.subagents = Object.keys(a.state.interns).length
      this.route(c, a.state.activity, false, a.state.detail, a.state.mode)
      this.files.set(a.id, a.state.files)
      this.inbox.set(a.id, a.inbox)

      for (const [iid, intern] of Object.entries(a.state.interns)) {
        const key = `${a.id}/${iid}`
        live.add(key)
        const ic = this.ensure(key, intern.type, 'intern', a.id, intern.activity)
        ic.selected = a.selected
        ic.gathered = this.retinue.get(key) ?? null
        this.route(ic, intern.activity, true, intern.detail)
      }
    }
    for (const [key, c] of this.chars)
      if (!live.has(key) && !c.leaving) {
        c.leaving = true
        c.activity = 'idle'
        this.release(key)
        const visit = this.fleet.visits.get(key)
        if (visit && c.waiting) {
          // Its car had not parked yet: nobody ever got out, and the car just goes.
          this.fleet.leave(key)
          this.dropChar(key, c)
        } else if (visit) {
          // Rush back through the door to the car.
          const [dx, dy] = carDoorPoint(visit.pose.x, visit.pose.y, visit.pose.h)
          c.speedMul = RUSH
          c.goTo(OFFICE.door)
          c.walkOutVia([FRONT_OF_DOOR, { x: dx, y: dy }])
        } else c.goTo(OFFICE.door)
      }
    this.drawBoard(agents)
    // Who has changed the most lines, on the lawn (drawn only when there is something to show).
    const score = scoreboardRows(agents.map((a) => ({ name: a.name, lines: a.linesChanged })))
    const json = JSON.stringify(score)
    if (json !== this.publishedScore) {
      this.publishedScore = json
      paintScoreboard(this.scoreboard, score)
      this.host.dataset.scoreboard = json
    }
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
        this.dropChar(key, c)
        // Back at its car: it jumps in and the car drives off.
        this.fleet.leave(key)
        continue
      }
      // The rush is over once it is at its place.
      if (c.speedMul !== 1 && c.arrived && !c.leaving) c.speedMul = 1
      if (c.arrived) atScreen.set(`${c.at.x},${c.at.y}`, c.activity)
    }
    // Anyone walking, or an envelope in flight, needs smooth frames: at the calm rate the gait and the steps turn uneven.
    if ([...this.chars.values()].some((c) => !c.waiting && !c.arrived) || this.flights.length > 0 || this.fleet.busy()) {
      const wasMoving = t - this.lastActive < MOVING_MS
      this.lastActive = t
      if (!wasMoving) this.pace()
    }
    for (const e of this.fleet.update(dt)) this.onFleet(e)
    this.visitors.calm = calmMotion()
    this.shouts.update(dt)
    this.visitors.update(dt)
    // Ordinary traffic keeps out of the way of a car that is racing through.
    this.street.makeWay(this.fleet.wayRanges())
    this.publishVisits()
    const said = this.shouts.active().map((x) => x.text).join()
    if (said !== this.publishedShouts) {
      this.publishedShouts = said
      this.host.dataset.shouts = JSON.stringify(this.shouts.active().map((x) => x.text))
    }
    this.drawPiles()
    this.syncBooks()
    this.syncStools()
    if (this.books.size !== this.publishedBooks || this.crewJson() !== this.publishedCrew) this.publishAnchors()
    this.drawMail(t)
    this.untangle()
    for (const [spot, s] of this.screens) s.draw(atScreen.get(spot) ?? null, t)
    this.ambient.update(t)
    this.sign.visible = this.chars.size === 0
    this.street.update(dt, t)
    this.plant.update(t)
  }

  // A small stool under each subagent sitting at its main agent's desk, drawn over the sitter like the desk chair.
  private syncStools() {
    for (const [key, g] of this.stools)
      if (!this.retinue.has(key) || !this.chars.get(key) || this.chars.get(key)!.leaving) {
        g.destroy()
        this.stools.delete(key)
      }
    for (const key of this.retinue.keys()) {
      const c = this.chars.get(key)
      if (!c || c.leaving || this.stools.has(key)) continue
      const g = new Graphics()
      const px = c.home.x * TILE
      const py = c.home.y * TILE
      g.rect(px + 4, py + 12, 2, 4).fill(0x8a9099)
      g.rect(px + 10, py + 12, 2, 4).fill(0x8a9099)
      g.rect(px + 2, py + 7, 12, 6).fill(0x5f9e5f)
      g.rect(px + 3, py + 8, 10, 1).fill(0x7fbe7a)
      g.rect(px + 3, py + 11, 10, 1).fill(0x4a7e4a)
      g.zIndex = py + TILE + 2
      this.layer.addChild(g)
      this.stools.set(key, g)
    }
  }

  // Each seated agent has a closed book on its desk; clicking it opens what the agent has changed.
  private syncBooks() {
    const seated = new Set<string>()
    for (const [key, c] of this.chars) if (OFFICE.desks.includes(c.home) && !c.leaving) seated.add(key)
    for (const [key, g] of this.books)
      if (!seated.has(key)) {
        g.destroy()
        this.books.delete(key)
      }
    for (const key of seated) {
      if (this.books.has(key)) continue
      const c = this.chars.get(key)!
      const g = new Graphics()
      const cover = paletteFor(key, 'senior').c
      // A closed book, cover in the agent's colour, pages showing on the right edge.
      g.rect(0, 0, 8, 10).fill(0x14111c)
      g.rect(1, 1, 6, 8).fill(cover)
      g.rect(1, 1, 1, 8).fill({ color: 0x000000, alpha: 0.3 })
      g.rect(3, 3, 3, 1).fill({ color: 0xffffff, alpha: 0.7 })
      g.rect(3, 5, 3, 1).fill({ color: 0xffffff, alpha: 0.4 })
      g.rect(7, 2, 1, 6).fill(0xf0ecdc)
      // On the desk's empty left side, clear of the monitor and keyboard; finished pages pile over it.
      g.position.set(c.home.x * TILE + 1, (c.home.y - 1) * TILE + 2)
      g.zIndex = c.home.y * TILE + 0.4
      g.eventMode = 'static'
      g.cursor = 'pointer'
      g.on('pointertap', () => {
        if (!this.dragged) this.onHandbook(key)
      })
      this.layer.addChild(g)
      this.books.set(key, g)
    }
  }

  /** Where an agent's character is on the stage (CSS px, from the stage's own corner), or null when it is not in the office. */
  screenPosOf(id: string): { x: number; y: number } | null {
    const c = this.chars.get(id)
    if (!c || c.leaving) return null
    const b = c.view.getBounds()
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  }

  /** The agent whose character is under a point on the stage (CSS px), for things dropped onto the canvas. */
  agentAt(x: number, y: number): string | null {
    for (const [key, c] of this.chars) if (!c.leaving && !key.includes('/') && c.view.getBounds().containsPoint(x, y)) return key
    return null
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
  /** The hoarding behind the office names the folder it works in; null takes it down. */
  setWorkspace(name: string | null) {
    paintBillboard(this.billboard, name)
  }

  setBanks(b: import('../../shared/limits').Bank[]) {
    this.plant.setBanks(b)
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
  private dropChar(key: string, c: Character) {
    c.view.destroy({ children: true })
    c.overlay.destroy({ children: true })
    this.chars.delete(key)
  }

  /** The passenger's moment: the car has parked, and they jump out and rush in to their seat. */
  private onFleet(e: FleetEvent) {
    if (e.type !== 'door') return
    const c = this.chars.get(e.key)
    const v = this.fleet.visits.get(e.key)
    if (!c || !v || c.leaving) return void this.fleet.leave(e.key)
    const [x, y] = carDoorPoint(v.pose.x, v.pose.y, v.pose.h)
    c.speedMul = RUSH
    c.appearAt(x, y, [FRONT_OF_DOOR])
  }

  // For tests: each car, what it is doing, who is with it and where it is, published when any of that changes.
  private publishVisits() {
    const rider = (key: string) => {
      const c = this.chars.get(key)
      return !c ? 'none' : c.waiting ? 'in the car' : c.speedMul > 1 ? 'rushing' : 'inside'
    }
    const sig = [...this.fleet.visits.values()].map((v) => `${v.key}:${v.phase}:${rider(v.key)}`).join()
    if (sig === this.publishedVisits) return
    this.publishedVisits = sig
    this.host.dataset.visits = JSON.stringify([...this.fleet.visits.values()].map((v) => ({ key: v.key, phase: v.phase, rider: rider(v.key), slot: v.slot, x: Math.round(v.pose.x), y: Math.round(v.pose.y), h: Math.round(v.pose.h * 100) / 100 })))
  }

  private untangle() {
    const chars = [...this.chars.values()].filter((c) => !c.waiting)
    const tagBoxes = chars.filter((c) => c.tagShownNow).map((c) => c.tagBox)
    const tags = spread(tagBoxes, 1)
    const placedTags = tagBoxes.map((b) => ({ ...b, id: `tag:${b.id}`, y: b.y + (tags[b.id] ?? 0) }))
    const bubbles = spread(chars.flatMap((c) => c.bubbleBox ?? []), -1, placedTags)
    for (const c of chars) {
      c.tagDy = tags[c.key] ?? 0
      c.bubbleDy = bubbles[c.key] ?? 0
    }
  }

  destroy() {
    this.visitors.destroy()
    clearTimeout(this.paceTimer)
    cancelAnimationFrame(this.raf)
    clearTimeout(this.frameTimer)
    document.removeEventListener('visibilitychange', this.repace)
    window.removeEventListener('focus', this.repace)
    window.removeEventListener('blur', this.repace)
    this.observer?.disconnect()
    this.app.destroy(true, { children: true })
  }
}
