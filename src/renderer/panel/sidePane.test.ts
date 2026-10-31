import { describe, expect, it } from 'vitest'
import { dragWidth, keyWidth, sideWidth } from './sidePane'

describe('the terminal pane beside the chat', () => {
  it('is about 40% of the window by default, never under 360px', () => {
    expect(sideWidth(null, 1500)).toBe(600)
    expect(sideWidth(null, 800)).toBe(360)
  })
  it('keeps what was dragged, within 320px and 70% of the window', () => {
    expect(sideWidth(500, 1500)).toBe(500)
    expect(sideWidth(200, 1500)).toBe(320)
    expect(sideWidth(1400, 1500)).toBe(1050)
  })
  it('is the distance from the pointer to the right edge while dragging, with the same limits', () => {
    expect(dragWidth(900, 1500)).toBe(600)
    expect(dragWidth(1450, 1500)).toBe(320)
    expect(dragWidth(10, 1500)).toBe(1050)
  })
  it('moves 20px with the arrow keys, the left key making the pane wider, within the limits', () => {
    expect(keyWidth(600, 'ArrowLeft', 1500)).toBe(620)
    expect(keyWidth(600, 'ArrowRight', 1500)).toBe(580)
    expect(keyWidth(325, 'ArrowRight', 1500)).toBe(320)
    expect(keyWidth(1045, 'ArrowLeft', 1500)).toBe(1050)
    expect(keyWidth(600, 'Enter', 1500)).toBeNull()
  })
})
