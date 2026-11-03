import { useEffect, useRef } from 'react'
import { textPixels } from '../world/pixelfont'

// Small pixel drawings for the voice screens, in the office's own palette. Every shape is square and every move is a whole step.
export const C = { ink: '#08070c', muted: '#a4a2b8', dim: '#4a4860', brass: '#f2c230', brassHot: '#f8d04c', brassDim: '#5a4c1e', cyan: '#6ad0e0', cyanDim: '#2f6670', green: '#5f9e5f', greenText: '#9fdc9f', red: '#d83a3a', redHot: '#e65050', violet: '#b38bff' }

export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

export const wordSize = (text: string, scale: number) => {
  const rows = textPixels(text)
  return { w: (rows[0]?.length ?? 0) * scale, h: rows.length * scale }
}
export function drawWord(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, scale: number, color: string) {
  ctx.fillStyle = color
  textPixels(text).forEach((row, j) => [...row].forEach((c, i) => c === '#' && ctx.fillRect(x + i * scale, y + j * scale, scale, scale)))
}

const cells = (ctx: CanvasRenderingContext2D, pts: number[][], s: number, color: string) => {
  ctx.fillStyle = color
  for (const [x, y] of pts) ctx.fillRect(x! * s, y! * s, s, s)
}
/** An 18px square: twelve cells round a ring, four lit, stepping on. */
export function drawSpinner(ctx: CanvasRenderingContext2D, f: number) {
  ctx.clearRect(0, 0, 18, 18)
  const ring = [[2, 0], [3, 0], [4, 1], [5, 2], [5, 3], [4, 4], [3, 5], [2, 5], [1, 4], [0, 3], [0, 2], [1, 1]]
  ring.forEach(([x, y], i) => cells(ctx, [[x! , y!]], 3, ((i - f) % 12 + 12) % 12 < 4 ? C.cyan : C.dim))
}
export function drawMark(ctx: CanvasRenderingContext2D, kind: 'ok' | 'no' | 'wait') {
  ctx.clearRect(0, 0, 18, 18)
  if (kind === 'ok') {
    cells(ctx, [[1, 3], [2, 4], [3, 3], [4, 2], [5, 1]], 3, C.green)
    cells(ctx, [[1, 2], [2, 3], [3, 2], [4, 1], [5, 0]], 3, C.greenText)
  }
  if (kind === 'no') cells(ctx, [[1, 1], [2, 2], [3, 3], [4, 4], [4, 1], [3, 2], [1, 4], [2, 3]], 3, C.redHot)
  if (kind === 'wait') cells(ctx, [[2, 3], [3, 3]], 3, C.dim)
}
export function drawLock(ctx: CanvasRenderingContext2D) {
  ctx.clearRect(0, 0, 24, 24)
  const r = (a: number, b: number, w: number, h: number, c: string) => ((ctx.fillStyle = c), ctx.fillRect(a * 2, b * 2, w * 2, h * 2))
  r(2, 5, 8, 6, C.ink); r(3, 6, 6, 4, C.brass); r(5, 7, 2, 2, C.ink)
  r(3, 1, 6, 1, C.ink); r(3, 1, 1, 5, C.ink); r(8, 1, 1, 5, C.ink); r(4, 2, 4, 1, C.muted); r(4, 2, 1, 4, C.muted); r(7, 2, 1, 4, C.muted)
}
/** The SAVED stamp: it lands from big to its size in four steps, in an inked brass frame. */
export function drawStamp(ctx: CanvasRenderingContext2D, W: number, H: number, text: string, age: number, still: boolean) {
  ctx.clearRect(0, 0, W, H)
  const sc = still || age >= 4 ? 5 : [11, 9, 7, 6][age]!
  const { w, h } = wordSize(text, sc)
  const x = Math.round((W - w) / 2 / 2) * 2, y = Math.round((H - h) / 2 / 2) * 2
  ctx.fillStyle = C.ink; ctx.fillRect(x - 12, y - 10, w + 24, h + 20)
  ctx.fillStyle = C.brass; ctx.fillRect(x - 8, y - 6, w + 16, h + 12)
  ctx.fillStyle = C.ink; ctx.fillRect(x - 4, y - 2, w + 8, h + 4)
  drawWord(ctx, text, x, y, sc, C.brassHot)
}
/** A burst of square bits from the middle that spreads and falls over fourteen frames. */
export function drawBurst(ctx: CanvasRenderingContext2D, W: number, H: number, age: number) {
  if (age > 14) return
  const cols = [C.brass, C.green, C.cyan, C.brassHot, C.violet]
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2, sp = 2 + (i % 5)
    ctx.fillStyle = cols[i % 5]!
    ctx.fillRect(Math.round((W / 2 + Math.cos(a) * sp * age * 1.6) / 3) * 3, Math.round((H / 2 + Math.sin(a) * sp * age * 1.1 + age * age * 0.18) / 3) * 3, 3, 3)
  }
}

/** A canvas that draws on a 12-frames-a-second clock (once only when still, or when the system asks for less motion). */
export function usePixelCanvas(draw: (ctx: CanvasRenderingContext2D, frame: number) => void, animated: boolean, deps: unknown[] = []) {
  const ref = useRef<HTMLCanvasElement>(null)
  const latest = useRef(draw)
  latest.current = draw
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    let f = 0
    ctx.imageSmoothingEnabled = false
    latest.current(ctx, f)
    if (!animated || reducedMotion()) return
    const t = setInterval(() => latest.current(ctx, ++f), 1000 / 12)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animated, ...deps])
  return ref
}
