import { useMemo } from 'react'
import { characterPixels, paletteFor } from '../world/sprites'
import type { Role } from '../world/worldState'

/** One of the office characters, drawn crisp at an integer scale, for places outside the canvas. */
export function PixelSprite({ name, role, scale = 4 }: { name: string; role: Role; scale?: number }) {
  const src = useMemo(() => {
    const rows = characterPixels(name, role, 'front', 'stand')
    const colors = paletteFor(name, role) as Record<string, number>
    const canvas = document.createElement('canvas')
    canvas.width = rows[0]!.length
    canvas.height = rows.length
    const ctx = canvas.getContext('2d')!
    rows.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        const c = colors[ch]
        if (c === undefined) return
        ctx.fillStyle = `#${c.toString(16).padStart(6, '0')}`
        ctx.fillRect(x, y, 1, 1)
      })
    )
    return { url: canvas.toDataURL(), w: canvas.width, h: canvas.height }
  }, [name, role])
  return <img className="pixel-word" src={src.url} width={src.w * scale} height={src.h * scale} alt="" />
}
