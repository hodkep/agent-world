import { useRef } from 'react'
import type { VoiceState } from '../../shared/voiceState'
import { C, usePixelCanvas } from './pixelFx'

export type OrbLook = VoiceState | 'muted'
const PALETTE: Record<OrbLook, { core: string; mid: string; rim: string }> = {
  idle: { core: C.brassHot, mid: C.brass, rim: C.brassDim },
  connecting: { core: C.cyan, mid: C.cyanDim, rim: C.dim },
  listening: { core: '#c8f2f8', mid: C.cyan, rim: C.cyanDim },
  thinking: { core: '#c8f2f8', mid: C.cyan, rim: C.cyanDim },
  speaking: { core: '#fff1a8', mid: C.brass, rim: C.brassDim },
  muted: { core: C.muted, mid: C.dim, rim: '#2a2640' },
  error: { core: '#ff9a9a', mid: C.red, rim: '#6a1c1c' }
}

/** A disc of square pixels. Its size follows the level of whoever is talking and its colour follows the state; every change is a whole step. */
export function drawOrb(ctx: CanvasRenderingContext2D, n: number, look: OrbLook, level: number, f: number, still: boolean) {
  const cell = ctx.canvas.width / n
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  const m = (n - 1) / 2
  const base = n * 0.2
  const p = PALETTE[look]
  const put = (x: number, y: number, col: string) => {
    if (x < 0 || y < 0 || x >= n || y >= n) return
    ctx.fillStyle = col
    ctx.fillRect(Math.round(x) * cell, Math.round(y) * cell, cell, cell)
  }
  const lv = still ? (look === 'listening' || look === 'speaking' ? 0.4 : 0) : level
  let R = base
  if (look === 'idle') R = base + (still ? 0 : (Math.floor(f / 10) % 2) * 0.5)
  if (look === 'connecting') R = base * 0.8
  if (look === 'listening') R = base + lv * n * 0.2
  if (look === 'thinking') R = base * 0.85
  if (look === 'speaking') R = base + lv * n * 0.22
  if (look === 'muted') R = base * 0.9
  if (look === 'error') R = base + (!still && Math.floor(f / 6) % 2 ? 0.8 : 0)
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x - m, y - m)
      if (d <= R) put(x, y, d < R * 0.4 ? p.core : d > R - 1.1 ? p.rim : p.mid)
      else if (d <= R + 1) put(x, y, C.ink)
    }
  const ring = (rr: number, step: number, col: string, a0 = 0) => {
    for (let a = 0; a < 48; a += step) put(m + Math.cos(a0 + (a / 48) * Math.PI * 2) * rr, m + Math.sin(a0 + (a / 48) * Math.PI * 2) * rr, col)
  }
  if (look === 'listening') ring(R + 2.5 + (still ? 0 : (f % 8) * 0.35) + lv * 1.5, 2, C.cyanDim)
  if (look === 'connecting') ring(R + 2 + (still ? 1 : Math.floor(f / 3) % 4), 3, C.cyanDim)
  if (look === 'thinking') for (let k = 0; k < 8; k++) put(m + Math.cos((k / 8 + (still ? 0 : Math.floor(f / 3) / 8)) * Math.PI * 2) * (R + 3), m + Math.sin((k / 8 + (still ? 0 : Math.floor(f / 3) / 8)) * Math.PI * 2) * (R + 3), k < 3 ? C.cyan : C.dim)
  if (look === 'speaking') {
    for (let k = 0; k < 16; k++) {
      const t = (k / 16) * Math.PI * 2 + 0.2
      const len = 1 + lv * n * 0.2 * (0.5 + 0.5 * Math.sin(k * 2.3 + (still ? 0 : f * 0.5)))
      for (let s = R + 1.6; s < R + 1.6 + len; s += 0.7) put(m + Math.cos(t) * s, m + Math.sin(t) * s, k % 2 ? C.brass : C.brassHot)
    }
  }
  if (look === 'muted') {
    for (let i = -R; i <= R; i++) put(m + i * 0.9 + 1, m + i * 0.9, C.ink)
    for (let i = -R; i <= R; i++) put(m + i * 0.9, m + i * 0.9, C.red)
  }
}

/** The orb as a canvas, `cells` squares across and `px` pixels to a square; it reads the level from `getLevel` as it draws. */
export function VoiceOrb({ look, getLevel, cells, px }: { look: OrbLook; getLevel: () => number; cells: number; px: number }) {
  const lv = useRef(0)
  const ref = usePixelCanvas((ctx, f) => {
    // The level eases toward the voice so the disc swells and settles in steps, not jitters.
    lv.current += (getLevel() - lv.current) * 0.6
    drawOrb(ctx, cells, look, lv.current, f, matchMedia('(prefers-reduced-motion: reduce)').matches)
  }, true, [look, cells])
  return <canvas ref={ref} className="vo" width={cells * px} height={cells * px} style={{ width: cells * px, height: cells * px }} aria-hidden="true" />
}
