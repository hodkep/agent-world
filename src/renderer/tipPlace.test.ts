// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { placeTip, showTipAt } from './tipPlace'

const win = { w: 1000, h: 700 }
const tip = { w: 280, h: 120 }
const at = (left: number, top: number, w = 80, h = 60) => ({ left, top, right: left + w, bottom: top + h, width: w, height: h })

describe('placeTip', () => {
  it('centres the card under the cell when there is room', () => {
    expect(placeTip(at(400, 100), tip, win)).toEqual({ left: 400 + 40 - 140, top: 160 + 6 })
  })
  it('keeps a card inside the left edge for a cell in the first column', () => {
    expect(placeTip(at(20, 100), tip, win).left).toBe(8)
  })
  it('keeps a card inside the right edge for a cell in the last column', () => {
    const p = placeTip(at(900, 100), tip, win)
    expect(p.left + tip.w).toBe(win.w - 8)
  })
  it('puts the card above the cell when there is no room below, and inside the top edge if there is none above either', () => {
    expect(placeTip(at(400, 600), tip, win).top).toBe(600 - 6 - 120)
    expect(placeTip(at(400, 50, 80, 60), { w: 280, h: 700 }, win).top).toBe(8)
  })
  it('keeps a card wider than the window at the left edge', () => {
    expect(placeTip(at(20, 100), { w: 2000, h: 50 }, win).left).toBe(8)
  })
})

describe('showTipAt', () => {
  it('measures the card of a cell and places it with fixed coordinates inside the window', () => {
    const cell = document.createElement('div')
    const el = cell.appendChild(document.createElement('div'))
    el.className = 'tip'
    cell.getBoundingClientRect = () => at(20, 100) as DOMRect
    el.getBoundingClientRect = () => ({ width: 280, height: 120 }) as DOMRect
    Object.assign(window, { innerWidth: 1000, innerHeight: 700 })
    showTipAt(cell, '.tip')
    expect(el.style.left).toBe('8px')
    expect(el.style.top).toBe('166px')
  })
})
