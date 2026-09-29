import { useMemo } from 'react'
import { textPixels } from './world/pixelfont'

// The wordmark uses the world's own bitmap font so the shell and the office speak one language.
export function PixelWord({ text, scale = 3, color = '#f2c230' }: { text: string; scale?: number; color?: string }) {
  const src = useMemo(() => {
    const rows = textPixels(text)
    const canvas = document.createElement('canvas')
    canvas.width = rows[0]!.length
    canvas.height = rows.length
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = color
    rows.forEach((row, y) => [...row].forEach((c, x) => c === '#' && ctx.fillRect(x, y, 1, 1)))
    return { url: canvas.toDataURL(), w: canvas.width, h: canvas.height }
  }, [text, color])
  return <img className="pixel-word" src={src.url} width={src.w * scale} height={src.h * scale} alt={text} />
}
