import { describe, expect, it } from 'vitest'
import { clampBar, readBar } from './dragBar'

const view = { width: 1000, height: 700 }
const bar = { width: 600, height: 60 }

describe('where the Keep and Undo bar may be put', () => {
  it('keeps a position that is inside the window as it is', () => {
    expect(clampBar({ x: 100, y: 200 }, bar, view)).toEqual({ x: 100, y: 200 })
  })
  it('keeps at least a handle of it inside the window on every side, so it can always be dragged back', () => {
    expect(clampBar({ x: -5000, y: -40 }, bar, view)).toEqual({ x: -(600 - 80), y: 0 })
    expect(clampBar({ x: 5000, y: 5000 }, bar, view)).toEqual({ x: 1000 - 80, y: 700 - 40 })
  })
  it('copes with a window smaller than the bar', () => {
    expect(clampBar({ x: 300, y: 10 }, bar, { width: 400, height: 300 })).toEqual({ x: 300, y: 10 })
    expect(clampBar({ x: 900, y: 10 }, bar, { width: 400, height: 300 })).toEqual({ x: 320, y: 10 })
  })
})

describe('a remembered position', () => {
  it('is read back when it is two numbers, and is nothing otherwise', () => {
    expect(readBar('{"x":12,"y":34}')).toEqual({ x: 12, y: 34 })
    for (const bad of [null, '', 'nope', '{}', '{"x":"1","y":2}', '{"x":1}', '[1,2]', '{"x":1e999,"y":1}']) expect(readBar(bad), String(bad)).toBeNull()
  })
})
