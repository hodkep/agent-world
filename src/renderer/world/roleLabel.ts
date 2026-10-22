import { Container, Graphics, Sprite } from 'pixi.js'
import { textPixels } from './pixelfont'
import { pixelTexture } from './sprites'

/** A name tag in the agents' own style (dark plate, yellow rule, white pixel text) for a figure that is not an agent: shown only while the pointer is on it. */
export function roleLabel(text: string): Container {
  const c = new Container()
  const rows = textPixels(text)
  const w = (rows[0]?.length ?? 0) + 6
  const plate = new Graphics()
  plate.rect(0, 0, w, 9).fill(0x14111c)
  plate.rect(0, 0, w, 1).fill(0xf2c230)
  const glyphs = new Sprite(pixelTexture(rows, { '#': 0xf4f4f8 }, `role/${text}`))
  glyphs.position.set(3, 2)
  c.addChild(plate, glyphs)
  c.pivot.set(Math.round(w / 2), 9)
  c.visible = false
  c.eventMode = 'none'
  return c
}
