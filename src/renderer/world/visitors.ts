import { Container, Graphics, Sprite, Texture } from 'pixi.js'
import type { CarPose } from './arrival'
import type { Fleet, Visit } from './fleet'
import { textPixels } from './pixelfont'
import { shade } from './grounds'

const DEG = Math.PI / 180
const STEP = 15 * DEG
const STEPS = 24
const INK = 0x14111c

const rect = (g: Graphics, x: number, y: number, w: number, h: number, c: number, a = 1) => g.rect(x, y, w, h).fill(a === 1 ? c : { color: c, alpha: a })
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`

const textures = new Map<string, Texture>()

/** The car turned `step` fifteenth-of-a-turns, turned on the pixel grid itself so it keeps the chunky look at any angle. */
function carTexture(color: number, step: number): Texture {
  const key = `${color}/${step}`
  const hit = textures.get(key)
  if (hit) return hit
  const base = document.createElement('canvas')
  base.width = 32
  base.height = 32
  const g = base.getContext('2d')!
  const r = (x: number, y: number, w: number, h: number, c: number, a = 1) => {
    g.globalAlpha = a
    g.fillStyle = hex(c)
    g.fillRect(x, y, w, h)
    g.globalAlpha = 1
  }
  const x = 3
  const y = 10
  r(x, y, 26, 12, INK)
  r(x + 1, y + 1, 24, 10, color)
  r(x + 7, y + 2, 12, 8, shade(color, 0.78))
  r(x + 19, y + 3, 2, 6, 0x8ec4dc)
  r(x + 5, y + 3, 2, 6, shade(0x8ec4dc, 0.7))
  r(x + 24, y + 1, 1, 3, 0xffe9a0)
  r(x + 24, y + 8, 1, 3, 0xffe9a0)
  r(x + 1, y + 1, 1, 3, 0xd83a3a)
  r(x + 1, y + 8, 1, 3, 0xd83a3a)
  const out = document.createElement('canvas')
  out.width = 32
  out.height = 32
  const o = out.getContext('2d')!
  o.imageSmoothingEnabled = false
  o.translate(16, 16)
  o.rotate(step * STEP)
  o.drawImage(base, -16, -16)
  const tex = Texture.from(out)
  tex.source.scaleMode = 'nearest'
  textures.set(key, tex)
  return tex
}

const turnStep = (h: number) => (((Math.round(h / STEP) % STEPS) + STEPS) % STEPS)
const rot = (x: number, y: number, a: number): [number, number] => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]
const wheel = (p: CarPose, side: number): [number, number] => {
  const [dx, dy] = rot(-9, side * 5, p.h)
  return [p.x + dx, p.y + dy]
}

interface Mark {
  x: number
  y: number
  at: number
}
interface Puff {
  x: number
  y: number
  at: number
  vx: number
  vy: number
}

const MARK_LIFE = 9000
const PUFF_LIFE = 560

/**
 * Draws the fleet: the cars, the hazard lights, the tyre marks they leave, the smoke and the shouts. `calm` leaves out
 * everything but the cars, for people who ask their system for less motion.
 */
export class VisitorsView {
  readonly view = new Container()
  private readonly cars = new Container()
  private readonly fx = new Graphics()
  private readonly sprites = new Map<string, Sprite>()
  private readonly marks: Mark[] = []
  private readonly puffs: Puff[] = []
  private readonly last = new Map<string, [number, number] | null>()
  private readonly smokeAt = new Map<string, number>()
  private clock = 0
  calm = false

  constructor(private readonly fleet: Fleet) {
    this.view.addChild(this.cars, this.fx)
  }

  /** True while something is drawn, so the last frame after everything has gone is cleared and then nothing more is done. */
  private drawn = false

  update(dtMs: number) {
    // Most of the time there is no car, no mark and no smoke: nothing to do.
    if (this.fleet.visits.size === 0 && this.marks.length === 0 && this.puffs.length === 0 && this.sprites.size === 0 && !this.drawn) return
    this.clock += dtMs
    const seen = new Set<string>()
    for (const v of this.fleet.visits.values()) {
      seen.add(v.key)
      this.place(v)
      if (!this.calm) this.emit(v, dtMs)
    }
    for (const [k, s] of this.sprites) {
      if (seen.has(k)) continue
      s.destroy()
      this.sprites.delete(k)
      this.last.delete(`${k}/-1`)
      this.last.delete(`${k}/1`)
    }
    this.draw()
    this.drawn = this.fleet.visits.size > 0 || this.marks.length > 0 || this.puffs.length > 0
  }

  private place(v: Visit) {
    let s = this.sprites.get(v.key)
    if (!s) {
      s = new Sprite()
      s.anchor.set(0.5)
      this.cars.addChild(s)
      this.sprites.set(v.key, s)
    }
    s.texture = carTexture(v.color, turnStep(v.pose.h))
    s.position.set(Math.round(v.pose.x), Math.round(v.pose.y + (v.pose.bounce ?? 0)))
  }

  private emit(v: Visit, dtMs: number) {
    const p = v.pose
    for (const side of [-1, 1]) {
      const id = `${v.key}/${side}`
      if (!p.skid) {
        this.last.set(id, null)
        continue
      }
      const [wx, wy] = wheel(p, side)
      const prev = this.last.get(id)
      if (!prev || Math.hypot(wx - prev[0], wy - prev[1]) > 1.4) {
        this.marks.push({ x: wx, y: wy, at: this.clock })
        this.last.set(id, [wx, wy])
      }
    }
    const acc = (this.smokeAt.get(v.key) ?? 0) + dtMs
    if (p.smoke && acc > (p.heavy ? 28 : 55)) {
      this.smokeAt.set(v.key, 0)
      for (const side of [-1, 1]) {
        const [wx, wy] = wheel(p, side)
        this.puffs.push({ x: wx + (Math.random() - 0.5) * 2, y: wy + (Math.random() - 0.5) * 2, at: this.clock, vx: -0.012 + (Math.random() - 0.5) * 0.01, vy: -0.006 + (Math.random() - 0.5) * 0.01 })
      }
    } else this.smokeAt.set(v.key, acc)
    if (this.marks.length > 600) this.marks.splice(0, this.marks.length - 600)
  }

  private draw() {
    const g = this.fx
    g.clear()
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const age = this.clock - this.marks[i]!.at
      if (age > MARK_LIFE) {
        this.marks.splice(i, 1)
        continue
      }
      rect(g, Math.round(this.marks[i]!.x), Math.round(this.marks[i]!.y), 1, 1, 0x0d0c11, 0.75 * (1 - age / MARK_LIFE))
    }
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i]!
      const age = this.clock - p.at
      if (age > PUFF_LIFE) {
        this.puffs.splice(i, 1)
        continue
      }
      const st = Math.floor((age / PUFF_LIFE) * 4)
      const size = [2, 3, 4, 3][st]!
      rect(g, Math.round(p.x + p.vx * age - size / 2), Math.round(p.y + p.vy * age - size / 2), size, size, 0xe4e4ec, [0.85, 0.65, 0.4, 0.2][st]!)
    }
    for (const v of this.fleet.visits.values()) {
      // Hazard lights while it waits for its passenger.
      if (v.phase === 'parked' && Math.floor(this.clock / 250) % 2 === 0)
        for (const [lx, ly] of [[-13, -6], [-13, 5], [12, -6], [12, 5]] as const) {
          const [dx, dy] = rot(lx, ly, v.pose.h)
          rect(g, Math.round(v.pose.x + dx), Math.round(v.pose.y + dy), 2, 2, 0xffb000)
        }
      if (!this.calm && v.pose.text) bubble(g, v.pose.text, Math.round(v.pose.x), Math.round(v.pose.y) - 24)
    }
  }

  destroy() {
    this.view.destroy({ children: true })
  }
}

/** A speech bubble in the app's pixel font, with its tail pointing down at `cx`. */
function bubble(g: Graphics, text: string, cx: number, y: number) {
  const rows = textPixels(text)
  const w = rows[0]!.length + 6
  const x = cx - Math.floor(w / 2)
  rect(g, x, y, w, 11, INK)
  rect(g, x + 1, y + 1, w - 2, 9, 0xf6f6fa)
  rect(g, cx - 1, y + 11, 3, 2, INK)
  rect(g, cx, y + 11, 1, 1, 0xf6f6fa)
  rows.forEach((row, ry) => [...row].forEach((c, rx) => c === '#' && rect(g, x + 3 + rx, y + 3 + ry, 1, 1, INK)))
}
