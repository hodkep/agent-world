import { useState } from 'react'

const KEY = 'aw.sidew'
const MIN = 140
/** The least the area beside the list keeps, so dragging can never squeeze it out. */
const KEEP = 240
const STEP = 16

const read = (): number | null => {
  try {
    const n = Number(localStorage.getItem(KEY))
    return n >= MIN ? n : null
  } catch {
    return null
  }
}
const save = (w: number | null) => {
  try {
    localStorage.setItem(KEY, w === null ? '' : String(Math.round(w)))
  } catch {
    /* remembering the width is a convenience */
  }
}

/**
 * The width of the list on the left (Files, Changes, the grid's side list), shared by all of them and remembered.
 * Put the returned `style` on the list and `<SideSizer/>` right after it.
 */
export function useSideWidth() {
  const [w, setW] = useState<number | null>(read)
  return { style: w ? { width: w } : undefined, sizer: { w, set: setW } }
}

export function SideSizer({ w, set }: { w: number | null; set: (w: number | null) => void }) {
  const clamp = (v: number, area: number) => Math.round(Math.max(MIN, Math.min(area - KEEP, v)))
  return (
    <div className="side-sizer">
      <div
        className="side-grip"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the list"
        tabIndex={0}
        title="Drag to resize · double-click to reset"
        onDoubleClick={() => (set(null), save(null))}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
          e.preventDefault()
          const list = e.currentTarget.parentElement!.previousElementSibling as HTMLElement
          const area = list.parentElement!.getBoundingClientRect().width
          const next = clamp((w ?? list.getBoundingClientRect().width) + (e.key === 'ArrowRight' ? STEP : -STEP), area)
          set(next)
          save(next)
        }}
        onPointerDown={(e) => {
          e.preventDefault()
          const el = e.currentTarget
          const list = el.parentElement!.previousElementSibling as HTMLElement
          const box = list.parentElement!.getBoundingClientRect()
          const left = box.left
          el.setPointerCapture(e.pointerId)
          let last = w
          const move = (ev: PointerEvent) => {
            last = clamp(ev.clientX - left, box.width)
            set(last)
          }
          const up = () => {
            el.removeEventListener('pointermove', move)
            el.removeEventListener('pointerup', up)
            save(last)
          }
          el.addEventListener('pointermove', move)
          el.addEventListener('pointerup', up)
        }}
      />
    </div>
  )
}
