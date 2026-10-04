export interface Pt {
  x: number
  y: number
}

/** A mark on a picture, in the picture's own pixels, so what is saved matches what was drawn at any zoom. */
export type Shape =
  | { kind: 'pen'; color: string; pts: Pt[] }
  | { kind: 'line' | 'arrow' | 'rect' | 'ellipse'; color: string; a: Pt; b: Pt }
  // Blacks the area out: the picture underneath is gone from the saved file, not just covered.
  | { kind: 'hide'; a: Pt; b: Pt }
  | { kind: 'text'; color: string; at: Pt; text: string }

export type Tool = Shape['kind']

/** What is drawn now (`done`) and the states before and after it, so undo and redo step through whole states, a clear included. */
export interface History {
  past: Shape[][]
  done: Shape[]
  future: Shape[][]
}

export const empty = (): History => ({ past: [], done: [], future: [] })
export const add = (h: History, s: Shape): History => ({ past: [...h.past, h.done], done: [...h.done, s], future: [] })
export const canUndo = (h: History) => h.past.length > 0
export const canRedo = (h: History) => h.future.length > 0
export const undo = (h: History): History => (canUndo(h) ? { past: h.past.slice(0, -1), done: h.past[h.past.length - 1]!, future: [...h.future, h.done] } : h)
export const redo = (h: History): History => (canRedo(h) ? { past: [...h.past, h.done], done: h.future[h.future.length - 1]!, future: h.future.slice(0, -1) } : h)
/** Every mark off at once; undo brings them all back. */
export const clear = (h: History): History => (h.done.length ? { past: [...h.past, h.done], done: [], future: [] } : h)

export const normRect = (a: Pt, b: Pt) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) })

/** The two ends of an arrow head, behind the tip at `b` and either side of the line from `a`. */
export function arrowHead(a: Pt, b: Pt, len: number): [Pt, Pt] {
  const dx = b.x - a.x
  const dy = b.y - a.y
  if (dx === 0 && dy === 0) return [{ ...b }, { ...b }]
  const back = Math.atan2(dy, dx) + Math.PI
  const wing = (turn: number): Pt => ({ x: b.x + len * Math.cos(back + turn), y: b.y + len * Math.sin(back + turn) })
  return [wing(Math.PI / 7), wing(-Math.PI / 7)]
}

/** Stroke width in picture pixels: thin on a small picture, thicker on a big screenshot so marks stay readable when it is shown small. */
export const lineWidth = (w: number, h: number) => Math.max(3, Math.round(Math.max(w, h) / 300))

/** Draws marks onto a canvas that is the picture's own size. */
export function drawShapes(ctx: CanvasRenderingContext2D, shapes: Shape[], w: number, h: number) {
  const lw = lineWidth(w, h)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = lw
  for (const s of shapes) {
    if (s.kind === 'hide') {
      const r = normRect(s.a, s.b)
      ctx.fillStyle = '#000000'
      ctx.fillRect(r.x, r.y, r.w, r.h)
      continue
    }
    ctx.strokeStyle = s.color
    ctx.fillStyle = s.color
    ctx.beginPath()
    if (s.kind === 'pen') {
      s.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
      // A single tap leaves a dot.
      if (s.pts.length === 1) ctx.lineTo(s.pts[0]!.x + 0.01, s.pts[0]!.y)
      ctx.stroke()
    } else if (s.kind === 'line' || s.kind === 'arrow') {
      ctx.moveTo(s.a.x, s.a.y)
      ctx.lineTo(s.b.x, s.b.y)
      if (s.kind === 'arrow') {
        const [l, r] = arrowHead(s.a, s.b, lw * 5)
        ctx.moveTo(l.x, l.y)
        ctx.lineTo(s.b.x, s.b.y)
        ctx.lineTo(r.x, r.y)
      }
      ctx.stroke()
    } else if (s.kind === 'rect') {
      const r = normRect(s.a, s.b)
      ctx.strokeRect(r.x, r.y, r.w, r.h)
    } else if (s.kind === 'ellipse') {
      const r = normRect(s.a, s.b)
      ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2)
      ctx.stroke()
    } else if (s.kind === 'text') {
      ctx.font = `700 ${lw * 7}px ui-sans-serif, system-ui, sans-serif`
      ctx.textBaseline = 'top'
      s.text.split('\n').forEach((line, i) => ctx.fillText(line, s.at.x, s.at.y + i * lw * 8.5))
    }
  }
}
