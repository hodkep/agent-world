import { Container, Graphics, Sprite } from 'pixi.js'
import { birdTexture, BIRD_KEYS, BIRD } from './critters'
import { OFFICE, TILE } from './office'
import { drawLampGlows, GROUNDS } from './grounds'
import { type Phase, type WeatherNow, outsideLight, phaseOf, tintFor } from './rituals'

const INK = 0x1a1522
const SKY: Record<Phase, [number, number]> = { dawn: [0x5a4a7a, 0xd89a78], day: [0x6aaee0, 0xbfe4f6], dusk: [0x4a3a7a, 0xe0805a], night: [0x10122a, 0x2a2a5a] }
const WIN = { x: 2, y: 5, w: 12, h: 20 }
/** What the office is told each frame about the hour, the weather and what is going on. */
export interface Sky {
  hour: number
  weather: WeatherNow
  /** 0 to 1: how dark the power cut has made it. */
  dark: number
  alarm: boolean
  /** Office life is on: the grounds follow the hour and the weather; off, they stay the night scene they are drawn as. */
  live: boolean
}

/**
 * The light over the office floor by the hour, the three windows in the back wall (sky, weather, a pigeon on a ledge now and then), the red flash of a fire drill,
 * and the pigeon that flies across when it gets in. Drawn in code like the rest of the world.
 */
export class Ambience {
  readonly tint = new Graphics()
  readonly windows = new Container()
  readonly flyer = new Container()
  /** What lies over the grounds (lawn, street, trees) and under the office: the light of the hour, the grey of the weather, the rain, the lamps' glow. */
  readonly outside = new Container()
  private readonly add = new Graphics()
  private readonly dim = new Graphics()
  private readonly rain = new Graphics()
  private readonly glow = drawLampGlows(OFFICE.map)
  private addShown = 0
  private dimShown = 0
  private addColor = 0
  private dimColor = 0
  private rainFrame = -1
  private readonly drawn = { add: '', dim: '' }
  private readonly panes: { x: number; g: Graphics; key: string }[] = []
  private readonly bird = new Sprite()
  private shown = 0
  private perch: { win: number; until: number } | null = null
  private nextPerch: number
  private flight: { from: number; end: number; at: number } | null = null
  private phase: Phase = 'day'
  private weather: WeatherNow = 'clear'

  constructor(
    private readonly rand: () => number,
    private readonly speed = 1
  ) {
    for (const d of OFFICE.decor.filter((x) => x.kind === 'window')) {
      const g = new Graphics()
      g.position.set(d.x * TILE + WIN.x, WIN.y)
      this.windows.addChild(g)
      this.panes.push({ x: d.x, g, key: '' })
    }
    // What lies over the office and the grounds is only light: clicks go through it to the book on a desk, the agents and everything else.
    for (const c of [this.tint, this.outside, this.flyer, this.windows]) c.eventMode = 'none'
    this.add.blendMode = 'add'
    this.outside.addChild(this.add, this.dim, this.glow, this.rain)
    this.bird.texture = birdTexture('fly1')
    this.bird.visible = false
    this.flyer.addChild(this.bird)
    this.nextPerch = (20_000 + this.rand() * 40_000) / speed
  }

  /** The pigeon flies in now, across the office, in about eight seconds. */
  pigeon(t: number) {
    if (this.flight) return
    this.flight = { from: t, end: t + 8000 / this.speed, at: 0 }
  }

  /** Where the flying pigeon is, for a shout above it. */
  get pos() {
    return { x: this.bird.x, y: this.bird.y }
  }

  get flying() {
    return this.flight !== null
  }

  get ledge() {
    return this.perch !== null
  }

  data() {
    return { phase: this.phase, weather: this.weather, ledge: this.ledge, flying: this.flying, tint: Math.round(this.shown * 100) / 100, outside: { add: Math.round(this.addShown * 100) / 100, dim: Math.round(this.dimShown * 100) / 100, lamps: this.glow.visible, rain: this.rainFrame >= 0 } }
  }

  update(dtMs: number, t: number, sky: Sky) {
    this.phase = phaseOf(sky.hour)
    this.weather = sky.weather
    const base = tintFor(sky.hour)
    const target = base.alpha + (0.64 - base.alpha) * sky.dark
    this.shown += (target - this.shown) * Math.min(1, dtMs / 600)
    // The power cut flickers as it starts: the light jumps back for a moment.
    const flicker = sky.dark > 0 && sky.dark < 1 && Math.floor(t / 110) % 3 === 0 ? 0.5 : 1
    const pulse = sky.alarm ? 0.1 + 0.08 * Math.sin(t / 160) : 0
    this.tint.clear()
    this.tint.rect(0, 0, OFFICE.map.w * TILE, OFFICE.map.h * TILE).fill({ color: sky.dark > 0 ? 0x000010 : base.color, alpha: this.shown * flicker })
    if (pulse > 0) this.tint.rect(0, 0, OFFICE.map.w * TILE, OFFICE.map.h * TILE).fill({ color: 0xe02020, alpha: pulse })

    this.updateOutside(dtMs, t, sky)

    // A pigeon lands on one window's ledge now and then, stays a little, and goes.
    if (this.perch && t >= this.perch.until) this.perch = null
    if (!this.perch && this.panes.length) {
      this.nextPerch -= dtMs
      if (this.nextPerch <= 0) {
        this.nextPerch = (90_000 + this.rand() * 150_000) / this.speed
        this.perch = { win: Math.floor(this.rand() * this.panes.length), until: t + (20_000 + this.rand() * 20_000) / this.speed }
      }
    }
    const rain = Math.floor(t / 130) % 4
    this.panes.forEach((p, i) => {
      const bird = this.perch?.win === i
      const key = `${this.phase}|${sky.weather}|${bird}|${sky.weather === 'rain' ? rain : 0}`
      if (key !== p.key) {
        p.key = key
        this.drawPane(p.g, this.phase, sky.weather, bird, rain)
      }
    })

    const f = this.flight
    if (f && t >= f.end) this.flight = null
    this.bird.visible = this.flight !== null
    if (this.flight) {
      const k = (t - this.flight.from) / (this.flight.end - this.flight.from)
      this.bird.texture = birdTexture(Math.floor(t / 110) % 2 ? 'fly1' : 'fly2')
      this.bird.x = Math.round(TILE * 2 + k * (OFFICE.map.w * TILE - TILE * 4))
      this.bird.y = Math.round(TILE * 4 + Math.sin(k * Math.PI * 3) * 14 + k * 18)
      this.flight.at = Math.round(this.bird.x)
    }
  }

  /** One huge rectangle over the grounds, redrawn only when its colour or its alpha has moved. */
  private paint(g: Graphics, color: number, alpha: number, which: 'add' | 'dim') {
    const a = alpha > 0.004 ? Math.round(alpha * 250) / 250 : 0
    const key = `${color}/${a}`
    if (key === this.drawn[which]) return
    this.drawn[which] = key
    g.clear()
    if (a) g.rect(-GROUNDS.west - 2400, -GROUNDS.north - 2400, OFFICE.map.w * TILE + GROUNDS.west + GROUNDS.east + 4800, OFFICE.map.h * TILE + GROUNDS.north + GROUNDS.south + 4800).fill({ color, alpha: a })
  }

  private updateOutside(dtMs: number, t: number, sky: Sky) {
    const light = sky.live ? outsideLight(sky.hour, sky.weather) : null
    const k = Math.min(1, dtMs / 800)
    const addTo = light?.add?.alpha ?? 0
    const dimTo = light?.dim.alpha ?? 0
    if (light?.add) this.addColor = light.add.color
    if (light) this.dimColor = light.dim.color
    this.addShown += (addTo - this.addShown) * k
    this.dimShown += (dimTo - this.dimShown) * k
    this.paint(this.add, this.addColor, this.addShown, 'add')
    this.paint(this.dim, this.dimColor, this.dimShown, 'dim')
    this.glow.visible = !!light?.lamps
    // Rain: short streaks falling over the whole grounds, redrawn four times a second.
    const frame = light?.rain ? Math.floor(t / 130) : -2
    if (frame !== this.rainFrame) {
      this.rainFrame = frame
      this.rain.clear()
      if (frame >= 0) {
        const w = OFFICE.map.w * TILE + GROUNDS.west + GROUNDS.east
        const h = OFFICE.map.h * TILE + GROUNDS.north + GROUNDS.south
        for (let i = 0; i < 700; i++) this.rain.rect(-GROUNDS.west + ((i * 97 + frame * 7) % w), -GROUNDS.north + ((i * 61 + frame * 17) % h), 2, 7).fill({ color: 0xb4d4f8, alpha: 0.75 })
      }
    }
  }

  private drawPane(g: Graphics, phase: Phase, weather: WeatherNow, bird: boolean, rain: number) {
    const r = (x: number, y: number, w: number, h: number, c: number) => g.rect(x, y, w, h).fill(c)
    const [top, low] = SKY[phase]
    g.clear()
    r(0, 0, WIN.w, WIN.h, INK)
    r(1, 1, 10, 8, top)
    r(1, 9, 10, 7, low)
    if (phase === 'night') {
      for (const [x, y] of [[2, 3], [8, 5], [6, 2], [9, 11]] as const) r(x, y, 1, 1, 0xf4f4f8)
      if (weather !== 'cloud') r(8, 3, 2, 2, 0xf4eecb)
    }
    if (phase === 'day') r(7, 3, 3, 3, 0xfff1a0)
    if (phase === 'dusk') r(4, 11, 4, 3, 0xf6d27a)
    if (phase === 'dawn') r(3, 11, 4, 3, 0xf6e0a0)
    if (weather !== 'clear') {
      const c = phase === 'night' ? 0x3a3a5a : weather === 'rain' ? 0x8a90a4 : 0xf4f4f8
      for (const [x, y, w] of [[2, 4, 6], [5, 9, 5]] as const) {
        r(x, y, w, 2, c)
        r(x + 1, y - 1, w - 2, 1, c)
      }
    }
    if (weather === 'rain') for (let i = 0; i < 5; i++) r(2 + ((i * 5 + rain) % 8), 9 + ((i * 3 + rain * 2) % 6), 1, 2, 0x9ac4f0)
    r(5, 1, 1, 15, INK)
    r(1, 8, 10, 1, INK)
    r(0, 17, WIN.w, 3, 0x8a7a9a)
    if (bird) {
      BIRD.tiny.forEach((row, y) =>
        [...row].forEach((ch, x) => {
          const c = BIRD_KEYS[ch]
          if (c !== undefined) r(2 + x, 10 + y, 1, 1, c)
        })
      )
    }
  }
}
