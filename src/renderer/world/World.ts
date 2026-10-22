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
import { CAR_COLORS, GRASS, GROUNDS, Street, drawGrounds, drawHiringSign, drawLampPosts, paintBillboard, paintScoreboard } from './grounds'
import { scoreboardRows } from './scoreboard'
import { PLANT, PowerPlant } from './power'
import { Carrom } from './carrom'
import { CarromBoard } from './carromBoard'
import { Cheers } from './cheers'
import { CoffeeTank, CoolerJar, SinkFill } from './cooler'
import { Confetti } from './confetti'
import { Life } from './life'
import { Ambience } from './ambience'
import { Cat } from './cat'
import { RiderView } from './riders'
import { Trip } from './trip'
import { CatBrain } from './catBrain'
import { bossSees } from './bossSees'
import { courierSteps, guardSteps, pizzaSteps } from './guestPlans'
import { Guests, type RareEvent, Rare, Rest, type WeatherNow, Weather, ritualAt } from './rituals'
import { Director, type Face, type Place as StaffPlace, type Scene, type Step, type Then } from './staff'
import { StaffActor } from './staffActor'
import type { LimitView, UsageLimits } from '../../shared/usage'
import { textPixels } from './pixelfont'
import { type Facing, OFFICE, RETINUE_SEATS, type Spot, TILE, retinueSpot } from './office'
import { spread } from './overlap'
import { nextZoom, wheelSteps } from './zoomSteps'
import { type AgentState, type Place, placeFor, roleOf } from './worldState'

TextureSource.defaultOptions.scaleMode = 'nearest'

// The street in front of the entrance, for the cars that bring subagents (see arrival.ts).
const MAP_W = OFFICE.map.w * TILE
const MAP_H = OFFICE.map.h * TILE
const LOT: Lot = { doorX: OFFICE.door.x * TILE + OFFICE.door.ox + TILE / 2, laneY: MAP_H + 40, slotY: MAP_H + 18, left: -GROUNDS.west - 40, right: MAP_W + GROUNDS.east + 40 }
/** Where a person is when they are at the door on the pavement side (feet y). */
const FRONT_OF_DOOR = { x: LOT.doorX, y: MAP_H + 14 }
/** How much faster than real time the staff's waits (aw.staffFast) and the cooler's water (aw.waterFast, else the same) run: 1, unless a spec sets it. */
const staffSpeed = (key = 'aw.staffFast', fallback = 1) => {
  try {
    return Number(localStorage.getItem(key)) || fallback
  } catch {
    return fallback
  }
}
/** The hour and minute: the real ones, or the ones a spec or a trial sets with aw.clockHour ("13" or "13:20"). */
const clockNow = () => {
  try {
    const set = localStorage.getItem('aw.clockHour')
    if (set) {
      const [h, m] = set.split(':').map(Number)
      if (Number.isFinite(h)) return { h: h!, m: Number.isFinite(m) ? m! : 0 }
    }
  } catch {
    // no storage: the real clock
  }
  const d = new Date()
  return { h: d.getHours(), m: d.getMinutes() }
}
/** The weather outside: the made-up one, unless a spec or a trial sets aw.weather to clear, cloud or rain. */
const weatherNow = (made: WeatherNow): WeatherNow => {
  try {
    const set = localStorage.getItem('aw.weather')
    if (set === 'clear' || set === 'cloud' || set === 'rain') return set
  } catch {
    // no storage: the made-up weather
  }
  return made
}
/** A spec or a trial can start an event at once: aw.officeCall holds "drill", "cut", "pigeon", "courier" or "pizza", and is taken as soon as it is seen. */
const takeCall = () => {
  try {
    const c = localStorage.getItem('aw.officeCall')
    if (c) localStorage.removeItem('aw.officeCall')
    return c
  } catch {
    return null
  }
}
/** The road in front of the door, in the world's pixels: where a scooter rides in and parks, and where the rider walks to the door. */
const TRIP = { left: LOT.left, right: LOT.right, laneY: MAP_H + 8 + 27, doorX: LOT.doorX, doorY: MAP_H + 4 }
/** The boy's seat at the carrom board (the left side, facing it, his back to the west door) and where the supervisor comes from to find him. */
const BOY_SEAT = { x: 24, y: 5 }
const BOARD_WEST = { x: 19, y: 5 }
const HUDDLE_LINES = ['What if we split it?', 'Arrow goes here.', 'Ship it?', 'Draw the boxes first.']
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
  /** How many tasks this agent has finished, so that one more is a cheer. */
  tasksDone?: number
  /** It announced a task and has not finished it. */
  taskOpen?: boolean
  /** It has just read something from the library: it walks to the bookshelf and pulls the book out while it reads. */
  reading?: boolean
  /** The library item it is reading, for the pill over its head. */
  readingName?: string
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
  whiteboard: [...OFFICE.whiteboard, ...OFFICE.overflow.desk],
  shelf: [...OFFICE.shelf, ...OFFICE.overflow.desk]
}
const MAX_PILE = 14
// Art pixels kept in view above the building (the power plant) and below it (the pavement and street).
const BAND = { north: 70, south: 44 }
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
  // The office boy and the supervisor: who they are, what they do next (the director), and the water in the cooler's jar. They stay out when "Office life" is off, or motion is turned down.
  private readonly director = new Director(Math.random, staffSpeed(), staffSpeed('aw.waterFast', staffSpeed()))
  private staff: StaffActor[] = []
  private cooler: CoolerJar | null = null
  private officeLife = true
  private lifeOn = false
  private places!: Scene['spots']
  private tank: CoffeeTank | null = null
  private sinkFx: SinkFill | null = null
  private filling: { start: number; ms: number } | null = null
  private carromBoard: CarromBoard | null = null
  private readonly life = new Life(Math.random, staffSpeed())
  private readonly cheers = new Cheers()
  private readonly confetti = new Confetti()
  private cheered = 0
  private publishedLife = ''
  private readonly errands = new Map<string, { kind: 'drink' | 'game' | 'eat' | 'huddle' | 'drill'; what?: 'water' | 'coffee'; phase: 'go' | 'do'; left: number; spot: Spot }>()
  // The second batch: the hour and the weather, the cat, the people at the door, the once-an-hour events, and who naps or stretches.
  private readonly ambience = new Ambience(Math.random, staffSpeed())
  private readonly weather = new Weather(Math.random, staffSpeed())
  private readonly rare = new Rare(Math.random, staffSpeed())
  private readonly comers = new Guests(Math.random, staffSpeed())
  private readonly rest = new Rest()
  private cat: Cat | null = null
  private guard: StaffActor | null = null
  // Visitors by scooter: where each is on the street (the trip), how it is drawn, and, once it is at the door, the office's own actor for what it does inside.
  private readonly callers = new Map<Trip, { kind: 'courier' | 'pizza'; view: RiderView; plan: () => Step[]; actor: StaffActor | null; since: number }>()
  private readonly riders = new Container({ sortableChildren: true })
  private cut: { start: number } | null = null
  private drill: { start: number; until: number } | null = null
  private event = ''
  private clock = { h: 12, m: 0, at: -1e9 }
  private bistro: StaffPlace[] = []
  private ritual: ReturnType<typeof ritualAt> = null
  private readonly napOff = new Map<string, number>()
  private readonly tired = new Set<string>()
  private readonly cool = new Map<string, number>()
  // The office boy at the carrom board: how often he joined, saw the supervisor coming, or was caught; when he may play again; and whether the supervisor is on his way to him.
  private readonly boyStats = { joined: 0, noticed: 0, caught: 0 }
  private boyBanUntil = 0
  private boyNextPlay = 0
  private catching = false
  private lastFree: string[] = []
  /** A trial asked for the office boy to join a game as soon as an agent is free. */
  private wantBoy = false
  private publishedAmbience = ''
  private game: { carrom: Carrom; keys: string[]; started: boolean; endAt: number; waited: number } | null = null
  // The jar as drawn: how full it looks (it fills over a moment after a swap) and whether it is in its place.
  private shownWater = 1
  private jarIn = true
  private publishedStaff = ''
  private publishedCrew = ''
  private plant!: PowerPlant
  private readonly sign = drawHiringSign(OFFICE.map)
  private readonly billboard = new Graphics()
  private readonly scoreboard = new Graphics()
  private publishedScore = ''
  private readonly mail = new Graphics()
  private readonly board = new Graphics()
  // The book an agent has pulled out of the wall shelf while it reads.
  private readonly pulledBook = new Graphics()
  private pulledKey = ''
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
    this.root.addChild(drawGrounds(OFFICE.map), this.billboard, this.scoreboard, this.plant.view, this.sign, this.street.view, drawLampPosts(OFFICE.map), this.visitors.view, this.riders, this.ambience.outside, drawFloors(OFFICE.map), shadows, this.layer, this.overlays)
    this.overlays.addChild(this.ambience.tint, this.ambience.lights, this.mail, this.visitors.bubbles, this.ambience.banner)
    this.board.zIndex = TILE * 2
    this.layer.addChild(this.board)
    this.pulledBook.zIndex = TILE * 2
    this.layer.addChild(this.pulledBook)
    const f = drawFurniture(OFFICE.furniture, OFFICE.decor, this.layer, shadows, COFFEE_SPOUT)
    this.screens = f.screens
    this.ambient = f.ambient
    this.buildStaff()
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
        // A turn of the wheel or a swipe on a trackpad is a step or a few, not one for each event it sends.
        const dir = this.wheel(e.deltaY, e.deltaMode, performance.now())
        if (dir) this.zoomBy(dir)
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
    const H = this.viewHeight() * dpr
    return Math.max(1, Math.floor(Math.min(W / (OFFICE.map.w * TILE), H / (OFFICE.map.h * TILE + BAND.north + BAND.south))))
  }

  /** The scale at which the office alone fills the window, edge to edge (with a small margin). */
  private officeScale() {
    const dpr = this.app.renderer.resolution
    const W = this.app.screen.width * dpr
    const H = this.viewHeight() * dpr
    const pad = 12
    return Math.max(1, Math.min(W / (OFFICE.map.w * TILE + pad), H / (OFFICE.map.h * TILE + pad)))
  }

  private deviceScale() {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom ?? this.sceneScale()))
  }

  private readonly wheel = wheelSteps()

  /** One step in or out, about a quarter, to a whole scale so art pixels stay even. */
  zoomBy(dir: 1 | -1) {
    const now = this.deviceScale()
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom(now, dir)))
    // Zooming about the middle of the view: the panned offset scales with the picture.
    this.pan.x *= clamped / now
    this.pan.y *= clamped / now
    this.zoom = clamped
    this.layout()
  }

  /** Height at the bottom of the stage that something else (the terminal drawer) covers; the office is fitted and centred above it. */
  private inset = 0

  private viewHeight() {
    return Math.max(1, this.app.screen.height - this.inset)
  }

  setInset(px: number) {
    px = Math.max(0, Math.round(px))
    if (px === this.inset) return
    this.inset = px
    // A fitted view is a fixed zoom, so it is fitted again to the room that is left.
    if (this.mode === 'office') this.zoom = this.officeScale()
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
    const width = this.app.screen.width
    const height = this.viewHeight()
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

  private route(c: Character, activity: Activity, intern: boolean, detail?: string, mode?: string, reading = false) {
    c.activity = activity
    c.detail = detail
    // On an errand or at the carrom board it stays away from its seat while it has nothing to do; with work it is called back.
    if (c.errand) {
      // A fire drill takes everyone out, those at work too.
      if (activity === 'idle' || this.errands.get(c.key)?.kind === 'drill') return
      c.errand = false
      this.cancelErrand(c.key)
    }
    const place = placeFor(activity, intern, mode, reading)
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
      c.reading = a.reading ? a.readingName ?? 'library' : undefined
      this.route(c, a.state.activity, false, a.state.detail, a.state.mode, a.reading)
      const cheer = this.cheers.observe(a.id, a.state.activity, a.tasksDone ?? 0, performance.now(), a.taskOpen ?? false)
      const now = performance.now()
      // After a long turn the agent stretches instead of the small cheer; a finished task is still cheered.
      const tired = this.rest.observe(a.id, a.state.activity, now * staffSpeed()) === 'stretch'
      if (cheer && !(tired && cheer === 'small')) this.celebrate(a.id, cheer === 'big', now)
      // It stretches once it has settled at its place, not on the way there.
      if (tired) this.tired.add(a.id)
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
    this.drawBooks(agents)
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

  /** A red spine sticks out of the shelf in front of each agent that is reading from the library. */
  private drawBooks(agents: AgentView[]) {
    const spots = agents.filter((a) => a.reading && placeFor(a.state.activity, false, a.state.mode, true) === 'shelf').map((a) => this.claims.get('shelf')?.get(a.id)).filter((x): x is Spot => !!x)
    const key = JSON.stringify(spots.map((s) => s.x))
    if (key === this.pulledKey) return
    this.pulledKey = key
    this.pulledBook.clear()
    // A brass plaque on the wall counts the books that are out.
    if (spots.length) {
      const rows = textPixels(String(spots.length))
      const w = rows[0]!.length
      const px = 6 * TILE + Math.floor((TILE - w - 4) / 2)
      const py = TILE + 3
      this.pulledBook.rect(px, py, w + 4, 9).fill(0x14111c)
      this.pulledBook.rect(px + 1, py + 1, w + 2, 7).fill(0xf2c230)
      rows.forEach((r, y) => [...r].forEach((c, x) => c === '#' && this.pulledBook.rect(px + 2 + x, py + 2 + y, 1, 1).fill(0x14111c)))
    }
    for (const s of spots) {
      const x = s.x * TILE + 5
      this.pulledBook.rect(x - 1, TILE + 2, 6, 11).fill(0x14111c)
      this.pulledBook.rect(x, TILE + 3, 4, 9).fill(0xd83a3a)
      this.pulledBook.rect(x, TILE + 3, 1, 9).fill({ color: 0xffffff, alpha: 0.3 })
    }
  }

  /** The tile beside a piece of furniture where someone stands to use it, and the way he faces it. */
  private standBy(f: { x: number; y: number; w: number; h: number }, prefer: Face = 'down'): StaffPlace {
    const map = OFFICE.map
    const around: StaffPlace[] = [
      { to: { x: f.x, y: f.y + f.h }, face: 'up' },
      { to: { x: f.x - 1, y: f.y }, face: 'right' },
      { to: { x: f.x + f.w, y: f.y }, face: 'left' },
      { to: { x: f.x, y: f.y - 1 }, face: 'down' }
    ]
    const order = prefer === 'down' ? around : [...around].sort((a, b) => (a.face === prefer ? -1 : b.face === prefer ? 1 : 0))
    return order.find((c) => map.walkable(c.to)) ?? { to: { x: OFFICE.door.x, y: OFFICE.door.y }, face: 'up' }
  }

  /** The places the staff and idle agents go to, from the furniture and the walls: built once. */
  private buildPlaces(): Scene['spots'] {
    const map = OFFICE.map
    const of = (kind: string) => OFFICE.furniture.filter((f) => f.kind === kind)
    const walk = (ps: StaffPlace[]) => ps.filter((p) => map.walkable(p.to))
    const counter = of('counter')[0]
    const machine: StaffPlace | null = counter ? { to: { x: counter.x + 3, y: counter.y - 1 }, face: 'down' } : null
    const door = { x: OFFICE.door.x, y: OFFICE.door.y }
    const one = (kind: string) => {
      const f = of(kind)[0]
      return f ? this.standBy(f) : { to: door, face: 'up' as Face }
    }
    return {
      door,
      cooler: one('cooler'),
      bin: one('bin'),
      counter: one('counter'),
      coffee: machine && map.walkable(machine.to) ? machine : one('counter'),
      printer: one('printer'),
            // The tap is on the counter's left, over the sink: he stands in front of it on the kitchen floor.
      sink: counter && map.walkable({ x: counter.x + 1, y: counter.y - 1 }) ? { to: { x: counter.x + 1, y: counter.y - 1 }, face: 'down' } : one('counter'),
      outside: walk([{ to: { x: OFFICE.door.x, y: OFFICE.door.y - 1 }, face: 'down' }, { to: { x: OFFICE.door.x + 1, y: OFFICE.door.y - 1 }, face: 'down' }]),
      corner: this.standBy({ x: 21, y: 12, w: 1, h: 1 }, 'down').to,
      plants: of('plant').map((f) => this.standBy(f)),
      // Only where nothing stands in front of him: a desk on the row below would hide the book he reads.
      shelves: OFFICE.shelf.filter((s) => map.walkable({ x: s.x, y: s.y + 1 })).map((s) => ({ to: { x: s.x, y: s.y }, face: 'up' as Face })),
      paintings: walk(OFFICE.decor.filter((d) => d.kind === 'frame').map((d) => ({ to: { x: d.x, y: 2 }, face: 'up' as Face }))),
      tables: [...of('meeting'), ...of('bistro'), ...of('coffee-table')].map((f) => this.standBy(f)),
      kanban: OFFICE.whiteboard.map((s) => ({ to: { x: s.x, y: s.y }, face: 'up' as Face })),
      phone: walk([{ to: { x: 20, y: 6 }, face: 'right' }, { to: { x: 27, y: 9 }, face: 'left' }, { to: { x: 4, y: 6 }, face: 'right' }]),
      sweep: [{ x: 5, y: 5 }, { x: 12, y: 5 }, { x: 5, y: 9 }, { x: 12, y: 9 }, { x: 9, y: 13 }, { x: 21, y: 6 }, { x: 27, y: 6 }, { x: 22, y: 9 }].filter((p) => map.walkable(p))
    }
  }

  private buildStaff() {
    const cooler = OFFICE.furniture.find((f) => f.kind === 'cooler')
    if (cooler) {
      this.cooler = new CoolerJar(cooler.x, cooler.y)
      this.cooler.set(1)
      this.layer.addChild(this.cooler.view)
    }
    const counter = OFFICE.furniture.find((f) => f.kind === 'counter')
    if (counter) {
      this.tank = new CoffeeTank(counter.x, counter.y)
      this.tank.set(1)
      this.layer.addChild(this.tank.view)
      this.sinkFx = new SinkFill(counter.x, counter.y)
      this.sinkFx.set(null)
      this.layer.addChild(this.sinkFx.view)
    }
    const carrom = OFFICE.furniture.find((f) => f.kind === 'carrom')
    if (carrom) {
      this.carromBoard = new CarromBoard(carrom.x, carrom.y)
      this.layer.addChild(this.carromBoard.view)
    }
    this.confetti.view.visible = false
    this.overlays.addChild(this.confetti.view, this.ambience.flyer)
    this.ambience.windows.zIndex = 1
    this.layer.addChild(this.ambience.windows)
    this.places = this.buildPlaces()
    const bistro = OFFICE.furniture.find((f) => f.kind === 'bistro')
    const fridge = OFFICE.furniture.find((f) => f.kind === 'fridge')
    this.bistro = [bistro && this.standBy(bistro, 'up'), fridge && this.standBy(fridge, 'right')].filter((p): p is StaffPlace => !!p)
    const free = (p: { x: number; y: number }) => OFFICE.map.walkable(p)
    const spots = {
      nap: [{ x: 21, y: 5 }, { x: 23, y: 5 }, { x: 19, y: 6 }, { x: 22, y: 6 }].filter(free),
      roam: [...this.places.sweep, this.places.corner],
      desks: OFFICE.furniture.filter((f) => f.kind === 'desk').map((f) => ({ x: f.x + 1, y: f.y - 1 })).filter(free)
    }
    this.cat = new Cat(OFFICE.map, new CatBrain(Math.random, staffSpeed()), spots, spots.nap[0] ?? this.places.corner)
    this.layer.addChild(this.cat.view)
    this.guard = new StaffActor('guard', 'the guard', OFFICE.map, { x: OFFICE.door.x + 1, y: OFFICE.door.y }, () => {})
    this.layer.addChild(this.guard.view)
    const hover = (_label: string) => () => {}
    const door = this.places.door
    const boy = new StaffActor('boy', 'the office boy', OFFICE.map, door, hover('the office boy'))
    const sup = new StaffActor('supervisor', 'the supervisor', OFFICE.map, door, hover('the supervisor'))
    this.staff = [boy, sup]
    for (const a of this.staff) {
      a.view.visible = false
      this.layer.addChild(a.view)
    }
  }

  setOfficeLife(on: boolean) {
    this.officeLife = on
  }

  /** A place beside an agent's seat, where someone can stand to talk to it, bring it something or watch it work. */
  private besideOf(c: Character): StaffPlace | null {
    const map = OFFICE.map
    const at = c.at
    // Beside a desk, else (on a sofa, where the seats run side by side) in front of it or behind it.
    return (
      [
        { to: { x: at.x + 2, y: at.y }, face: 'left' as Face },
        { to: { x: at.x - 1, y: at.y }, face: 'right' as Face },
        { to: { x: at.x, y: at.y + 1 }, face: 'up' as Face },
        { to: { x: at.x, y: at.y - 1 }, face: 'down' as Face }
      ].find((b) => map.walkable(b.to)) ?? null
    )
  }

  /** What the director is told when it plans: where agents work or idle, how many are idle, and where the staff stand to do their jobs. */
  private sceneFor(boy: StaffActor): Scene {
    const map = OFFICE.map
    const working: StaffPlace[] = []
    const idleAgents: StaffPlace[] = []
    let idle = 0
    for (const c of this.chars.values()) {
      if (c.role === 'intern' || c.leaving || c.waiting || !c.arrived) continue
      if (c.activity === 'idle') idle++
      const beside = this.besideOf(c)
      if (!beside) continue
      if (['thinking', 'researching', 'implementing', 'running', 'delegating', 'compacting'].includes(c.activity)) working.push(beside)
      else if (c.activity === 'idle' && !c.errand && (c.doing === '' || c.doing === 'nap')) idleAgents.push(beside)
    }
    const bt = boy.at
    const meet = [{ to: { x: bt.x + 1, y: bt.y }, face: 'left' as Face }, { to: { x: bt.x - 1, y: bt.y }, face: 'right' as Face }].find((m) => map.walkable(m.to)) ?? { to: { ...bt }, face: 'left' as Face }
    return { working, idle, spots: this.places, boy: { ...bt }, boyCarrying: boy.carrying !== '', meet, idleAgents, ritual: this.ritual, catchAt: this.game?.keys.includes('boy') && this.game.started && !this.catching ? BOARD_WEST : null }
  }

  /** Staff and idle agents put away: no game, no errand, no confetti. */
  private lifeOff() {
    for (const key of [...this.errands.keys()]) this.cancelErrand(key)
    this.game = null
    this.catching = false
    this.staff[0]?.cancel()
    this.carromBoard?.setCoins(null)
    this.confetti.update(1e6)
    this.drill = null
    this.cut = null
    for (const c of this.chars.values()) if (c.doing === 'nap' || c.doing === 'stretch' || c.doing === 'eat' || c.doing === 'draw') c.doing = ''
  }

  private cancelErrand(key: string) {
    const c = this.chars.get(key)
    this.errands.delete(key)
    if (c) {
      c.errand = false
      if (c.doing === 'sip' || c.doing === 'coffee' || c.doing === 'play' || c.doing === 'eat' || c.doing === 'draw') c.doing = ''
      this.route(c, c.activity, false)
    }
    const g = this.game
    if (g?.keys.includes(key)) {
      g.keys = g.keys.filter((k) => k !== key)
      // A game is for two or four: with one gone the rest stop.
      if (g.keys.length < 2 || g.keys.length % 2 === 1) this.endGame()
    }
  }

  private endGame() {
    const g = this.game
    this.game = null
    this.catching = false
    this.carromBoard?.setCoins(null)
    if (!g) return
    if (g.keys.includes('boy')) {
      // The office boy gets up and is the director's again; he does not play again for five minutes.
      this.staff[0]?.cancel()
      this.boyNextPlay = performance.now() + 300_000 / staffSpeed()
    }
    for (const key of g.keys) {
      const c = this.chars.get(key)
      this.errands.delete(key)
      this.restAfter(key)
      if (c) {
        c.errand = false
        c.doing = ''
        this.route(c, c.activity, false)
      }
    }
  }

  /** After anything it did away from its seat an agent sits for one to three minutes before it goes off again, so the office is not on the move all the time. */
  private restAfter(key: string) {
    this.cool.set(key, performance.now() + (60_000 + Math.random() * 120_000) / staffSpeed())
  }

  /** Idle agents now and then fetch a cup of water or coffee, or sit down to carrom; every one of them is called back the moment it has work. */
  private lifeTick(dt: number, t: number) {
    for (const [key, e] of [...this.errands]) {
      const c = this.chars.get(key)
      if (!c || c.leaving || (e.kind !== 'drill' && c.activity !== 'idle')) this.cancelErrand(key)
    }
    const free = [...this.chars.entries()].filter(([k, c]) => c.role !== 'intern' && !c.leaving && !c.waiting && c.arrived && c.activity === 'idle' && !c.errand && c.doing === '' && c.gathered === null && (this.cool.get(k) ?? 0) <= t).map(([k]) => k)
    const huddle = [...this.errands.values()].some((e) => e.kind === 'huddle')
    const plan = this.drill ? null : this.life.decide(dt, free, { game: !!this.game, water: this.director.water, coffee: this.director.coffee, ritual: this.ritual, huddle, away: [...this.errands.values()].filter((e) => e.kind !== 'drill').length })
    if (plan?.kind === 'drink') this.startDrink(plan.agent, plan.what)
    else if (plan?.kind === 'game') this.startGame(plan.agents)
    else if (plan?.kind === 'eat') this.startEat(plan.agent)
    else if (plan?.kind === 'huddle') this.startHuddle(plan.agents)
    this.lastFree = free
    // A trial asks for the boy at the board now: a game of the agents' own makes way for it.
    if (this.wantBoy && this.game && !this.game.keys.includes('boy')) this.endGame()
    else if (this.wantBoy && !this.game) {
      // For a trial an agent's rest after its last errand does not count.
      const idle = [...this.chars].filter(([, c]) => c.role !== 'intern' && !c.leaving && c.arrived && c.activity === 'idle' && !c.errand && c.doing === '').map(([k]) => k)
      if (idle.length) ((this.wantBoy = false), this.startBoyGame(idle))
    }
    // The office boy, resting, sometimes joins an idle agent at the board: when the supervisor is far off, and not for a while after he was caught or saw him coming.
    const [boy, sup] = this.staff as [StaffActor, StaffActor]
    const away = [...this.errands.values()].filter((e) => e.kind !== 'drill').length
    if (!this.game && !this.drill && away < 2 && t >= this.boyBanUntil && t >= this.boyNextPlay && boy.isResting && Math.hypot(sup.at.x - BOY_SEAT.x, sup.at.y - BOY_SEAT.y) >= 10 && Math.random() < (dt * staffSpeed()) / 120_000) this.startBoyGame(free)
    for (const [key, e] of this.errands) {
      const c = this.chars.get(key)
      if (!c || e.kind === 'game' || e.kind === 'drill') continue
      if (e.phase === 'go' && c.arrived) {
        e.phase = 'do'
        c.doingAt = t
        if (e.kind === 'drink') {
          c.doing = e.what === 'coffee' ? 'coffee' : 'sip'
          this.director.sip(e.what!)
        } else {
          c.doing = e.kind === 'eat' ? 'eat' : 'draw'
          e.left = 30_000 / staffSpeed()
          if (e.kind === 'huddle' && Math.random() < 0.5) this.shouts.say(`huddle:${key}`, HUDDLE_LINES[Math.floor(Math.random() * HUDDLE_LINES.length)]!, 2400, () => ({ x: c.view.x + TILE / 2, y: c.view.y - 34 }))
        }
      } else if (e.phase === 'do') {
        e.left -= dt
        if (e.left <= 0) {
          this.errands.delete(key)
          c.errand = false
          c.doing = ''
          this.restAfter(key)
          this.route(c, c.activity, false)
        }
      }
    }
    const g = this.game
    if (g) {
      g.waited += dt
      if (!g.started) {
        const here = g.keys.every((k) => (k === 'boy' ? this.boyAtSeat() : this.chars.get(k)?.arrived))
        if (here) {
          g.started = true
          for (const k of g.keys) {
            const c = this.chars.get(k)
            if (!c) continue
            c.doing = 'play'
            c.doingAt = t
            const e = this.errands.get(k)
            if (e) e.phase = 'do'
          }
          this.carromBoard?.setCoins(g.carrom.coins)
        } else if (g.waited > 25_000) this.endGame()
      } else if (g.endAt > 0) {
        if (t >= g.endAt) this.endGame()
      } else {
        const say = (key: string, text: string, ms = 1200) => {
          const c = this.chars.get(key)
          if (c) this.shouts.say(`carrom:${key}`, text, ms, () => ({ x: c.view.x + TILE / 2, y: c.view.y - 34 }))
        }
        for (const ev of g.carrom.update(dt)) {
          if (ev.type === 'strike') {
            const c = this.chars.get(g.keys[ev.player]!)
            if (c) c.doingAt = t
            this.carromBoard?.strike(ev.player, g.keys.length)
          } else if (ev.type === 'pocket') {
            this.carromBoard?.setCoins(g.carrom.coins)
            if (ev.coin === 'queen') say(g.keys[ev.player]!, 'Queen!')
          } else {
            say(g.keys[ev.winner]!, 'Board!', 2200)
            g.endAt = t + 2600
          }
        }
      }
    }
    this.carromBoard?.update(dt)
    // A cheer or a clap ends by itself.
    for (const c of this.chars.values()) if ((c.doing === 'cheer' || c.doing === 'clap' || c.doing === 'stretch') && t >= c.doingUntil) c.doing = ''
    this.restTick(dt, t)
    this.drillTick(t)
    this.bossWatch(t)
    this.confetti.update(dt)
    const life = JSON.stringify({
      errands: [...this.errands].map(([agent, e]) => ({ agent, kind: e.kind, what: e.what ?? '', phase: e.phase })),
      game: this.game && { players: this.game.keys, started: this.game.started, strikes: this.game.carrom.strikes, scores: this.game.carrom.scores, over: this.game.carrom.over },
      cheers: this.cheered,
      boy: { ...this.boyStats, playing: !!(this.game?.keys.includes('boy') && this.game.started), at: this.staff[0] ? { x: this.staff[0].at.x, y: this.staff[0].at.y } : null },
      doing: [...this.chars].filter(([, c]) => c.doing === 'nap' || c.doing === 'stretch').map(([agent, c]) => ({ agent, doing: c.doing })),
      coffee: Math.round(this.director.coffee * 100) / 100
    })
    if (life !== this.publishedLife) {
      this.publishedLife = life
      this.host.dataset.life = life
    }
  }

  private startDrink(key: string, what: 'water' | 'coffee') {
    const c = this.chars.get(key)
    if (!c) return
    const taken = new Set([...this.errands.values()].map((e) => `${e.spot.x},${e.spot.y}`))
    const base = what === 'water' ? this.places.cooler : this.places.coffee
    const at: StaffPlace[] = what === 'water' ? [base, { to: { x: base.to.x - 1, y: base.to.y }, face: base.face }] : [base, { to: { x: base.to.x - 1, y: base.to.y }, face: base.face }, { to: { x: base.to.x + 1, y: base.to.y }, face: base.face }]
    const place = at.find((p) => OFFICE.map.walkable(p.to) && !taken.has(`${p.to.x},${p.to.y}`))
    if (!place) return
    const spot: Spot = { x: place.to.x, y: place.to.y, facing: place.face, ox: 0, seated: false }
    c.errand = true
    c.goTo(spot)
    this.errands.set(key, { kind: 'drink', what, phase: 'go', left: (25_000 + Math.random() * 20_000) / staffSpeed(), spot })
  }

  private startGame(agents: string[]) {
    if (this.game || !this.carromBoard) return
    const n = agents.length
    const seats: [number, number, Facing][] = n === 2 ? [[24, 5, 'right'], [27, 6, 'left']] : [[24, 6, 'right'], [27, 5, 'left'], [25, 4, 'down'], [26, 7, 'up']]
    this.game = { carrom: new Carrom(n, Math.random, staffSpeed()), keys: [...agents], started: false, endAt: 0, waited: 0 }
    agents.forEach((key, i) => {
      const c = this.chars.get(key)
      const [x, y, facing] = seats[i]!
      const spot: Spot = { x, y, facing, ox: 0, seated: false }
      if (key === 'boy') return this.boySits(spot)
      if (!c) return
      c.errand = true
      c.goTo(spot)
      this.errands.set(key, { kind: 'game', phase: 'go', left: 0, spot })
    })
  }


  private boyAtSeat() {
    const boy = this.staff[0]!
    return boy.at.x === BOY_SEAT.x && boy.at.y === BOY_SEAT.y && boy.standing
  }

  /** The office boy walks to his seat at the board and stays there, in the pose of one playing, until the game ends or he is called away. */
  private boySits(spot: Spot) {
    const boy = this.staff[0]!
    this.boyStats.joined++
    boy.cancel()
    boy.give([{ kind: 'walk', to: { x: spot.x, y: spot.y } }, { kind: 'wait', ms: 3_600_000, face: 'right', pose: 'wipe' }])
  }

  /** He joins an idle agent at the board. */
  private startBoyGame(free: string[]) {
    if (this.game || !free.length) return
    this.startGame(['boy', free[Math.floor(Math.random() * free.length)]!])
  }

  /** He sees the supervisor coming: "Boss!", he leaves the game (the agent says "Hey!") and cleans for a while. */
  private boyNotices(t: number) {
    const g = this.game
    if (!g) return
    const boy = this.staff[0]!
    const other = g.keys.find((k) => k !== 'boy')
    this.shouts.say('boy-boss', 'Boss!', 1600, () => ({ x: boy.view.x + TILE / 2, y: boy.view.y - 28 }))
    const c = other ? this.chars.get(other) : undefined
    if (c) this.shouts.say('boy-hey', 'Hey!', 1600, () => ({ x: c.view.x + TILE / 2, y: c.view.y - 34 }))
    this.boyStats.noticed++
    this.boyBanUntil = t + 90_000 / staffSpeed()
    this.endGame()
    boy.give(this.director.cleaning(this.sceneFor(boy), 90_000))
  }

  /** The supervisor's can has landed on the office boy, who had his back to him: "Ouch!", a salute, and back to work, with no carrom for three minutes. */
  private boyCaught(t: number) {
    const g = this.game
    this.catching = false
    if (!g?.keys.includes('boy')) return
    const boy = this.staff[0]!
    this.shouts.say('boy-ouch', 'Ouch!', 1600, () => ({ x: boy.view.x + TILE / 2, y: boy.view.y - 28 }))
    this.boyStats.caught++
    this.boyBanUntil = t + 180_000 / staffSpeed()
    this.endGame()
    boy.give([{ kind: 'wait', ms: Math.round(1100 / staffSpeed()), face: 'down', pose: 'salute' }, ...this.director.cleaning(this.sceneFor(boy), 90_000)])
  }

  /** While the office boy plays, the supervisor's walk towards him is watched: the boy sees him or does not. */
  private bossWatch(t: number) {
    const g = this.game
    if (!g?.keys.includes('boy') || !g.started || this.catching) return
    const [boy, sup] = this.staff as [StaffActor, StaffActor]
    const n = bossSees(boy.at, 'right', sup.at)
    if (n === 'sees') this.boyNotices(t)
    else if (n === 'behind') {
      // He has not seen him: the supervisor walks up behind him and swings his can.
      this.catching = true
      sup.cancel()
      sup.give([{ kind: 'walk', to: { x: boy.at.x - 1, y: boy.at.y } }, { kind: 'wait', ms: Math.round(1400 / staffSpeed()), face: 'right', pose: 'wipe', prop: 'can', say: 'Get back to work!', then: 'hit' }])
    }
  }

  /** An idle agent goes for its lunch to the bistro table or the fridge. */
  private startEat(key: string) {
    const c = this.chars.get(key)
    if (!c) return
    const taken = new Set([...this.errands.values()].map((e) => `${e.spot.x},${e.spot.y}`))
    const spots = this.bistro.flatMap((p) => [p, { to: { x: p.to.x - 1, y: p.to.y }, face: p.face }, { to: { x: p.to.x + 1, y: p.to.y }, face: p.face }])
    const place = spots.find((p) => OFFICE.map.walkable(p.to) && !taken.has(`${p.to.x},${p.to.y}`))
    if (!place) return
    const spot: Spot = { x: place.to.x, y: place.to.y, facing: place.face, ox: 0, seated: false }
    c.errand = true
    c.goTo(spot)
    this.errands.set(key, { kind: 'eat', phase: 'go', left: 0, spot })
  }

  /** Two or three idle agents go to the whiteboard and draw on it together. */
  private startHuddle(agents: string[]) {
    const board = OFFICE.whiteboard.filter((s) => OFFICE.map.walkable(s) && ![...this.errands.values()].some((e) => e.spot.x === s.x && e.spot.y === s.y))
    agents.slice(0, board.length).forEach((key, i) => {
      const c = this.chars.get(key)
      if (!c) return
      const spot = board[i]!
      c.errand = true
      c.goTo(spot)
      this.errands.set(key, { kind: 'huddle', phase: 'go', left: 0, spot })
    })
  }

  /** Everyone out of the building for a fire drill: they gather in front of the door, wait a few seconds, and go back to what they were doing. */
  private startDrill(t: number) {
    const keys = [...this.chars].filter(([, c]) => c.role !== 'intern' && !c.leaving && c.arrived).map(([k]) => k)
    if (!keys.length || this.drill) return
    const row = [4, 5, 6, 7, 10, 11, 12, 13, 3, 14].map((x) => ({ x, y: 15 })).filter((p) => OFFICE.map.walkable(p))
    if (!row.length) return
    this.drill = { start: t, until: 0 }
    keys.forEach((key, i) => {
      const c = this.chars.get(key)!
      const p = row[i % row.length]!
      const spot: Spot = { x: p.x, y: p.y, facing: 'down', ox: 0, seated: false }
      this.cancelErrand(key)
      c.errand = true
      c.doing = ''
      c.goTo(spot)
      this.errands.set(key, { kind: 'drill', phase: 'go', left: 0, spot })
    })
    const door = this.places.door
    this.shouts.say('drill', 'FIRE DRILL!', 3200, () => ({ x: door.x * TILE + TILE, y: door.y * TILE - 46 }))
  }

  private drillTick(t: number) {
    const dr = this.drill
    if (!dr) return
    const mine = [...this.errands].filter(([, e]) => e.kind === 'drill')
    const speed = staffSpeed()
    if (!dr.until) {
      if (mine.every(([k]) => this.chars.get(k)?.arrived) || t - dr.start > 15_000 / speed) dr.until = t + 6000 / speed
    } else if (t >= dr.until) {
      this.drill = null
      for (const [key] of mine) {
        const c = this.chars.get(key)
        this.errands.delete(key)
        if (c) {
          c.errand = false
          this.route(c, c.activity, false)
        }
      }
      const door = this.places.door
      this.shouts.say('drill', 'All clear', 2200, () => ({ x: door.x * TILE + TILE, y: door.y * TILE - 46 }))
    }
  }

  /** Idle agents doze off after a while (two idle minutes, then at a random moment), snore now and then, and wake after a minute or so. */
  private restTick(dt: number, t: number) {
    const speed = staffSpeed()
    const sT = t * speed
    for (const [key, c] of this.chars) {
      if (c.role === 'intern' || c.leaving) continue
      if (this.tired.has(key)) {
        if (c.activity !== 'idle') this.tired.delete(key)
        else if (c.arrived && c.doing === '' && !c.errand) {
          this.tired.delete(key)
          c.doing = 'stretch'
          c.doingAt = t
          c.doingUntil = t + 5000
          this.shouts.say(`stretch:${key}`, 'Yaaawn...', 3600, () => ({ x: c.view.x + TILE / 2, y: c.view.y - 34 }))
        }
      }
      if (c.doing === 'nap') {
        if (c.activity !== 'idle' || c.errand || t >= (this.napOff.get(key) ?? 0)) {
          c.doing = ''
          this.napOff.set(key, t + 30_000 / speed)
        } else if (t >= c.doingUntil) {
          c.doingUntil = t + 4500 / speed
          this.shouts.say(`nap:${key}`, 'Zzz...', 1800, () => ({ x: c.view.x + TILE / 2, y: c.view.y - 34 }))
        }
      } else if (c.doing === '' && !c.errand && c.arrived && c.activity === 'idle' && c.gathered === null && this.rest.napping(key, sT) && t >= (this.napOff.get(key) ?? 0) && Math.random() < (dt * speed) / 20_000) {
        c.doing = 'nap'
        c.doingAt = t
        c.doingUntil = t + 1500 / speed
        this.napOff.set(key, t + (40_000 + Math.random() * 30_000) / speed)
      }
    }
  }

  /** A courier or a pizza delivery rides in along the road on a scooter, parks in front of the door and walks in; one of each kind at a time. */
  private spawnGuest(kind: 'courier' | 'pizza', plan: () => Step[]) {
    if (!this.lifeOn || [...this.callers.values()].some((c) => c.kind === kind)) return
    const trip = new Trip(TRIP, staffSpeed())
    const view = new RiderView(kind)
    this.riders.addChild(view.view)
    this.callers.set(trip, { kind, view, plan, actor: null, since: performance.now() })
  }

  private dropCaller(trip: Trip) {
    const c = this.callers.get(trip)
    if (!c) return
    c.actor?.view.destroy({ children: true })
    c.view.destroy()
    this.callers.delete(trip)
  }

  private callersTick(dt: number, t: number) {
    for (const [trip, c] of [...this.callers]) {
      trip.update(dt)
      c.view.update(trip, t)
      if (trip.mode === 'inside' && !c.actor) {
        // At the door: the office's own actor takes over, comes in, does its errand, and goes out again.
        const label = c.kind === 'courier' ? 'the courier' : 'the pizza delivery'
        const a = new StaffActor(c.kind, label, OFFICE.map, this.places.door, () => {})
        a.setShown(true)
        a.give(c.plan())
        this.layer.addChild(a.view)
        c.actor = a
      }
      const a = c.actor
      if (a) {
        const say = (text: string, ms: number) => this.shouts.say(`guest:${a.kind}`, text, ms, () => ({ x: a.view.x + TILE / 2, y: a.view.y - 28 }))
        const then = (what: Then) => {
          if (what === 'parcel') a.carrying = 'parcel'
          else if (what === 'drop') a.carrying = ''
        }
        a.update(dt, t, { then, say })
        if (a.free && t - c.since > 800) a.setShown(false)
        if (a.faded) {
          a.view.destroy({ children: true })
          c.actor = null
          c.since = Infinity
          trip.finish()
        }
      }
      if (trip.mode === 'gone') this.dropCaller(trip)
    }
  }

  /** The hour, the weather, the cat, the guard, the people at the door and the rare events: everything the second batch adds to the office. */
  private ambientTick(dt: number, t: number, on: boolean) {
    if (t - this.clock.at > 500) this.clock = { ...clockNow(), at: t }
    const hour = on ? this.clock.h : 12
    this.ritual = on ? ritualAt(this.clock.h, this.clock.m) : null
    const speed = staffSpeed()
    if (on) {
      this.weather.tick(dt)
      const call = takeCall()
      if (call === 'courier') this.spawnGuest('courier', () => courierSteps(this.places.door, this.places.printer))
      else if (call === 'pizza') this.spawnGuest('pizza', () => pizzaSteps(this.places.door, this.places.counter))
      const sup = this.staff[1]!
      if (call === 'boyplay') this.wantBoy = true
      else if (call === 'boss') (sup.cancel(), sup.give([{ kind: 'walk', to: BOARD_WEST }]))
      // From the east he is in front of the boy, who sees him.
      else if (call === 'bosseast') (sup.cancel(), sup.place({ x: 28, y: 5 }), sup.give([{ kind: 'wait', ms: 3000 }]))
      let ev: RareEvent | null = null
      if (call === 'drill' || call === 'cut' || call === 'pigeon') ev = this.rare.call(call)
      else if (!this.drill && !this.cut && !this.ambience.flying && this.chars.size > 0) ev = this.rare.decide(dt)
      if (ev === 'cut') {
        this.cut = { start: t }
        this.shouts.say('cut', 'Power cut!', 2400, () => ({ x: OFFICE.map.w * TILE * 0.5, y: 4 * TILE }))
      } else if (ev === 'drill') this.startDrill(t)
      else if (ev === 'pigeon') {
        this.ambience.pigeon(t)
        this.shouts.say('pigeon', 'Coo!', 1600, () => ({ x: this.ambience.pos.x + 6, y: this.ambience.pos.y - 8 }))
      }
      if (this.comers.tick(dt, this.clock.h) === 'courier') this.spawnGuest('courier', () => courierSteps(this.places.door, this.places.printer))
    }
    let dark = 0
    if (this.cut) {
      const dur = 12_000 / speed
      const e = t - this.cut.start
      if (e > dur) {
        this.cut = null
        this.shouts.say('cut', 'Lights are back', 2000, () => ({ x: OFFICE.map.w * TILE * 0.5, y: 4 * TILE }))
      } else dark = e < 600 / speed ? e / (600 / speed) : e > dur - 800 / speed ? Math.max(0, (dur - e) / (800 / speed)) : 1
    }
    this.ambience.update(dt, t, { hour, weather: on ? weatherNow(this.weather.now) : 'clear', dark, alarm: !!this.drill, live: on, event: this.drill ? 'drill' : this.cut ? 'cut' : '', t })
    this.cat?.setShown(on)
    this.cat?.update(dt, t)
    const guard = this.guard
    if (guard) {
      const post = on && Guests.guardOn(this.clock.h)
      guard.setShown(post)
      if (post && guard.free) guard.give(guardSteps())
      guard.update(dt, t, { then: () => {}, say: () => {} })
    }
    if (!on) for (const trip of [...this.callers.keys()]) this.dropCaller(trip)
    this.callersTick(dt, t)
    const event = this.drill ? 'drill' : this.cut ? 'cut' : this.ambience.flying ? 'pigeon' : ''
    const json = JSON.stringify({
      hour,
      ritual: this.ritual ?? '',
      event,
      ...this.ambience.data(),
      weather: on ? weatherNow(this.weather.now) : 'clear',
      cat: on && this.cat ? { state: this.cat.state, x: this.cat.at.x, y: this.cat.at.y, label: this.cat.labelShown } : null,
      guard: on && Guests.guardOn(this.clock.h),
      callers: [...this.callers.values()].map((c) => c.kind),
      trips: [...this.callers].map(([trip, c]) => ({ kind: c.kind, mode: trip.mode, x: Math.round(trip.scooter.x), y: Math.round(trip.scooter.y) }))
    })
    if (json !== this.publishedAmbience) {
      this.publishedAmbience = json
      this.host.dataset.ambience = json
    }
  }

  /** An agent has finished: it cheers (hops, arms up, a burst of confetti, a shout), the agents next to it clap. */
  private celebrate(key: string, big: boolean, t: number) {
    const c = this.chars.get(key)
    if (!c || !this.lifeOn || c.role === 'intern') return
    c.doing = 'cheer'
    c.doingAt = t
    c.doingUntil = t + (big ? 3200 : 2200)
    this.confetti.burst(c.view.x + TILE / 2, c.view.y + 4, big ? 70 : 26)
    this.shouts.say(`cheer:${key}`, big ? 'TASK DONE!' : 'DONE!', 1600, () => ({ x: c.view.x + TILE / 2, y: c.view.y - 36 }))
    for (const [k, o] of this.chars)
      if (k !== key && o.role !== 'intern' && !o.errand && o.doing === '' && Math.hypot(o.at.x - c.at.x, o.at.y - c.at.y) <= 4) {
        o.doing = 'clap'
        o.doingAt = t
        o.doingUntil = t + 2000
      }
    this.cheered++
    if (big && this.comers.pizzaAfterTask(this.clock.h)) {
      const to = this.besideOf(c) ?? this.places.counter
      this.spawnGuest('pizza', () => pizzaSteps(this.places.door, to))
    }
  }

  private staffTick(dt: number, t: number) {
    const on = this.officeLife && this.chars.size > 0 && !calmMotion()
    this.lifeOn = on
    this.ambientTick(dt, t, on)
    const [boy, sup] = this.staff as [StaffActor, StaffActor]
    if (!on) {
      for (const a of this.staff) (a.setShown(false), a.fade(dt))
      this.cooler?.set(1)
      this.tank?.set(1)
      this.filling = null
      this.sinkFx?.set(null)
      this.shownWater = 1
      this.jarIn = true
      this.lifeOff()
      const none = JSON.stringify({ water: 1, staff: [] })
      if (none !== this.publishedStaff) (this.publishedStaff = none, (this.host.dataset.staff = none))
      return
    }
    for (const a of this.staff) a.setShown(true)
    const scene = this.sceneFor(boy)
    this.director.tick(dt, scene.idle)
    // A new jar fills over a moment; otherwise the jar shows what is in it.
    const target = this.director.water
    this.shownWater = this.shownWater < target - 0.001 ? Math.min(target, this.shownWater + dt / 900) : target
    this.cooler?.set(this.shownWater, this.jarIn)
    this.tank?.set(this.director.coffee)
    this.sinkFx?.set(this.filling ? (t - this.filling.start) / this.filling.ms : null)
    const say = (a: StaffActor) => (text: string, ms: number) => this.shouts.say(`staff:${a.kind}`, text, ms, () => ({ x: a.view.x + TILE / 2, y: a.view.y - 28 }))
    const then = (a: StaffActor) => (what: Then) => {
      switch (what) {
        case 'fetch':
          a.carrying = 'jar'
          break
        case 'swapOut':
          this.jarIn = false
          a.carrying = 'old-jar'
          break
        case 'fill':
          // The empty jar is set under the tap, and fills.
          a.carrying = ''
          this.filling = { start: t, ms: Math.round(2200 / staffSpeed()) }
          break
        case 'takeJar':
          this.filling = null
          a.carrying = 'jar'
          break
        case 'swapIn':
          this.jarIn = true
          this.shownWater = 0
          this.director.refill()
          a.carrying = ''
          break
        case 'takeBook':
        case 'putBook':
          break
        case 'pickOld':
          a.carrying = 'old-jar'
          break
        case 'bag':
          a.carrying = 'bag'
          break
        case 'parcel':
          a.carrying = 'parcel'
          break
        case 'tray':
          a.carrying = 'tray'
          break
        case 'drop':
          a.carrying = ''
          break
        case 'sipWater':
          this.director.sip('water')
          break
        case 'sipCoffee':
          this.director.sip('coffee')
          break
        case 'brew':
          this.director.brew()
          break
        case 'hit':
          this.boyCaught(t)
          break
        default:
          boy.release()
      }
    }
    if (sup.free) {
      const plan = this.director.supervisorPlan(scene)
      sup.give(plan.steps)
      if (plan.meetsBoy) boy.hold()
    }
    if (boy.free) {
      const ordered = this.director.order !== null
      const steps = this.director.boyPlan(scene)
      // Told something, he turns to the one who told him before he salutes.
      const first = steps[0]
      if (ordered && first?.kind === 'wait') first.face = boy.faceTile(sup.at)
      boy.give(steps)
    }
    boy.update(dt, t, { then: then(boy), say: say(boy) })
    sup.update(dt, t, { then: then(sup), say: say(sup) })
    this.lifeTick(dt, t)
    const state = JSON.stringify({ water: Math.round(this.director.water * 100) / 100, staff: this.staff.map((a) => ({ kind: a.kind, x: a.at.x, y: a.at.y, pose: a.pose, said: a.said, carrying: a.carrying, label: a.labelShown })) })
    if (state !== this.publishedStaff) {
      this.publishedStaff = state
      this.host.dataset.staff = state
    }
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
    this.staffTick(dt, t)
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
      // Under the sitter wherever the seat is nudged to (the two across the desk sit a little apart).
      const px = c.home.x * TILE + c.home.ox
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

  /** An envelope flies to the door: for someone who is not in the office (yet) and will arrive by car. */
  sendMailToDoor(fromId: string) {
    const a = this.chars.get(fromId)
    if (!a) return
    const door = OFFICE.door
    this.flights.push({ from: { x: a.view.x + TILE / 2, y: a.view.y - 4 }, to: { x: door.x * TILE + door.ox, y: door.y * TILE - 4 }, start: performance.now() })
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
    this.cool.delete(key)
    this.rest.forget(key)
    this.tired.delete(key)
    this.napOff.delete(key)
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
