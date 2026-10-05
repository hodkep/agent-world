import { Container, Graphics, Rectangle } from 'pixi.js'
import { BRAND } from '../../shared/brand'
import type { Bank } from '../../shared/limits'
import { DEFAULT_PROVIDER } from '../../shared/types'
import { type LimitView, limitView } from '../../shared/usage'
import { shade } from './grounds'
import { textPixels } from './pixelfont'

// The office's power plant, out on the back lawn: one tank per subscription window. The liquid is what is left
// of the 5-hour and weekly limits, so a glance at the lawn says whether the agents can keep working.

type G = Graphics
const INK = 0x14111c
const STEEL = 0x8c93a6
const STEEL_DARK = 0x5a6070
const r = (g: G, x: number, y: number, w: number, h: number, c: number, a = 1) => g.rect(x, y, w, h).fill(a === 1 ? c : { color: c, alpha: a })

export const PLANT = { w: 156, h: 54 }
const LIQUID = { ok: 0x46c8e6, warn: 0xf2b830, hot: 0xe05050 }

function text(g: G, s: string, x: number, y: number, color: number) {
  textPixels(s).forEach((row, ry) => [...row].forEach((c, rx) => c === '#' && r(g, x + rx, y + ry, 1, 1, color)))
}
const textW = (s: string) => textPixels(s)[0]!.length

/** What the tank shows for one window: the level left, its colour, and whether it needs attention. */
export function tankState(v: LimitView) {
  if (v.pct === null) return { left: null as number | null, color: 0x3a4658, urgent: false }
  const left = Math.max(0, Math.min(100, 100 - v.pct))
  return { left, color: LIQUID[v.level], urgent: left <= 10 }
}

function tank(g: G, x: number, y: number, w: number, h: number, v: LimitView, label: string, t: number, seed: number, plate: number) {
  const s = tankState(v)
  const inner = { x: x + 2, y: y + 3, w: w - 4, h: h - 6 }
  // Steel cap and legs, glass body.
  r(g, x - 1, y - 3, w + 2, 4, INK)
  r(g, x, y - 2, w, 2, STEEL)
  r(g, x + Math.floor(w / 2) - 1, y - 6, 3, 4, INK)
  r(g, x + Math.floor(w / 2), y - 5, 1, 2, STEEL)
  r(g, x, y, w, h, INK)
  r(g, inner.x, inner.y, inner.w, inner.h, 0x16222e)
  const fill = s.left === null ? 0 : Math.round((inner.h * s.left) / 100)
  if (fill > 0) {
    const top = inner.y + inner.h - fill
    r(g, inner.x, top, inner.w, fill, s.color)
    r(g, inner.x, top, inner.w, 1, shade(s.color, 1.3))
    // A ripple crawls along the surface.
    const rip = Math.floor(t / 260 + seed) % inner.w
    r(g, inner.x + rip, top, 1, 1, shade(s.color, 0.8))
    // Bubbles rise through the liquid.
    if (fill > 6)
      for (let i = 0; i < 3; i++) {
        const by = inner.y + inner.h - 2 - (Math.floor(t / 70 + i * 23 + seed * 7) % (fill - 3))
        r(g, inner.x + 2 + ((i * 5 + seed) % Math.max(1, inner.w - 4)), by, 1, 1, shade(s.color, 1.5), 0.8)
      }
  } else if (s.left === null) text(g, '?', x + Math.floor((w - 3) / 2), y + Math.floor(h / 2) - 2, 0x5a6a80)
  // Gauge ticks and a glint on the glass.
  for (const q of [0.25, 0.5, 0.75]) r(g, inner.x + inner.w - 3, Math.round(inner.y + inner.h * q), 3, 1, INK, 0.55)
  r(g, inner.x + 1, inner.y + 1, 1, inner.h - 2, 0xffffff, 0.14)
  // Running low: the glass cracks and a drop leaks out.
  if (s.urgent && s.left !== null) {
    for (const [dx, dy] of [[5, 6], [6, 7], [5, 8], [6, 9], [7, 10]] as const) r(g, x + dx, y + dy, 1, 1, INK)
    const drip = Math.floor(t / 110) % 14
    if (drip < 9) r(g, x + 5, y + h + drip, 1, 2, s.color)
  }
  // Label above, level below.
  r(g, x, y - 13, textW(label) + 4, 8, plate)
  text(g, label, x + 2, y - 11, INK)
  return s
}

const STATE_TEXT = (worst: number | null) => (worst === null ? 'wait' : worst <= 0 ? 'out' : worst <= 10 ? 'low' : 'ok')

/** The plant is drawn in one Graphics and redrawn every frame; its tanks bubble, blink and leak on their own clock. */
export class PowerPlant {
  readonly view = new Container()
  private readonly g = new Graphics()
  private banks: Bank[] = []
  private views = { five: limitView(null, 0), week: limitView(null, 0) }

  constructor(
    x: number,
    y: number,
    private readonly h: { onHover: (v: { five: LimitView; week: LimitView } | null, x: number, y: number) => void }
  ) {
    this.view.position.set(x, y)
    this.view.addChild(this.g)
    this.view.eventMode = 'static'
    this.view.cursor = 'help'
    this.view.hitArea = new Rectangle(0, 0, PLANT.w, PLANT.h)
    this.view.on('pointerover', (e) => this.h.onHover(this.views, e.global.x, e.global.y))
    this.view.on('pointermove', (e) => this.h.onHover(this.views, e.global.x, e.global.y))
    this.view.on('pointerout', () => this.h.onHover(null, 0, 0))
  }

  /** One bank of two tanks for each connected program. */
  setBanks(b: Bank[]) {
    this.banks = b
  }

  /** Where to find it on screen, for the page (and tests) to anchor to. */
  center() {
    const p = this.view.getGlobalPosition()
    const s = this.view.parent?.scale.x ?? 1
    return { x: Math.round(p.x + (PLANT.w / 2) * s), y: Math.round(p.y + (PLANT.h / 2) * s) }
  }

  update(t: number) {
    const now = Date.now()
    // The tooltip's fallback view is the tightest of each kind across the banks.
    const tight = (pick: (b: Bank) => Bank['five']) => this.banks.map(pick).filter((l): l is NonNullable<Bank['five']> => !!l).reduce<NonNullable<Bank['five']> | null>((a, l) => (!a || l.pct > a.pct ? l : a), null)
    this.views = { five: limitView(tight((b) => b.five), now), week: limitView(tight((b) => b.week), now) }
    const g = this.g
    g.clear()
    // Concrete pad with a lip.
    r(g, 0, 46, PLANT.w, 8, INK)
    r(g, 1, 47, PLANT.w - 2, 6, 0x4a4e5a)
    r(g, 1, 47, PLANT.w - 2, 1, 0x6a6f7c)
    // A bank of two tanks for each program: one program as before, several side by side, each labelled in its own colour.
    const banks: Bank[] = this.banks.length ? this.banks : [{ provider: DEFAULT_PROVIDER, five: null, week: null }]
    const n = banks.length
    const lows: number[] = []
    banks.forEach((b, i) => {
      const plate = BRAND[b.provider].color
      const wide = n === 1
      const bw = wide ? 96 : Math.floor((100 - (n - 1) * 4) / n)
      const bx = wide ? 6 : 4 + i * (bw + 4)
      const tw = wide ? 44 : Math.floor((bw - 2) / 2)
      const fw = wide ? 34 : tw
      const wk = tank(g, bx, wide ? 12 : 16, tw, wide ? 34 : 30, limitView(b.week, now), 'wk', t, 3 + i, plate)
      const fx = wide ? 62 : bx + tw + 2
      const fh = tank(g, fx, wide ? 18 : 22, fw, wide ? 28 : 24, limitView(b.five, now), '5h', t, 1 + i, plate)
      if (wide)
        for (const [x0, x1] of [[50, 62], [96, 106]] as const) {
          r(g, x0, 39, x1 - x0, 4, INK)
          r(g, x0, 40, x1 - x0, 2, STEEL)
          r(g, x0 + Math.floor((x1 - x0) / 2) - 1, 37, 3, 3, 0xd83a3a)
        }
      // Level read-outs on the pad.
      for (const [s, x] of [[wk, bx + 3], [fh, fx + 3]] as const) {
        if (s.left === null) continue
        text(g, `${Math.round(s.left)}%`, x, 48, s.color)
        lows.push(s.left)
      }
    })
    // Control box: a lightning bolt, a lamp and a one-word verdict.
    const low = lows.length ? Math.min(...lows) : null
    const lamp = low === null ? 0x5a6a80 : low <= 10 ? (Math.floor(t / 350) % 2 ? 0xff6a5a : 0x8a2020) : low <= 30 ? 0xf2b830 : 0x5fd07a
    r(g, 106, 24, 46, 22, INK)
    r(g, 107, 25, 44, 20, STEEL_DARK)
    r(g, 109, 27, 40, 12, 0x0c141c)
    text(g, STATE_TEXT(low), 112, 31, low === null ? 0x7a8aa0 : low <= 10 ? 0xff8a7a : low <= 30 ? 0xf2c230 : 0x7ae09a)
    r(g, 111, 41, 4, 2, lamp)
    r(g, 110, 40, 6, 4, lamp, 0.25)
    for (const [bx, by] of [[136, 41], [137, 41], [135, 42], [136, 42], [137, 43], [136, 43]] as const) r(g, bx, by, 1, 1, 0xf2c230)
    // Antenna with a beacon that blinks when something is low.
    r(g, 128, 14, 2, 10, STEEL)
    r(g, 126, 12, 6, 3, lamp, low !== null && low <= 10 && Math.floor(t / 350) % 2 ? 1 : 0.85)
  }
}
