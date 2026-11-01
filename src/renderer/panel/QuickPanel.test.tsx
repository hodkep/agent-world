// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { QuickPanel, shiftIntoWindow } from './QuickPanel'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('how far a panel is moved to stay in the window', () => {
  it('is not moved when it fits', () => expect(shiftIntoWindow(100, 556, 1000)).toBe(0))
  it('moves left by what runs over the right edge, leaving the margin', () => expect(shiftIntoWindow(700, 1156, 1000)).toBe(-168))
  it('never moves past the left margin', () => expect(shiftIntoWindow(100, 900, 600)).toBe(-88))
  it('moves right when it starts off the left edge', () => expect(shiftIntoWindow(-30, 400, 1000)).toBe(42))
})

describe('the panel under a switcher button', () => {
  afterEach(() => void (document.body.innerHTML = ''))
  it('is shifted left, and its arrow with it kept under the button, when it would run past the window', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true })
    const host = document.body.appendChild(document.createElement('div'))
    host.innerHTML = '<div class="qp-wrap" style="left:0"></div>'
    const wrap = host.firstElementChild as HTMLElement
    wrap.getBoundingClientRect = () => ({ left: 700 + parseFloat(wrap.style.left || '0'), right: 1156 + parseFloat(wrap.style.left || '0'), top: 0, bottom: 0, width: 456, height: 0, x: 0, y: 0, toJSON: () => ({}) })
    await act(async () => createRoot(wrap).render(<QuickPanel label="Agents" title="Agents" count={1}>x</QuickPanel>))
    expect(wrap.style.left).toBe('-168px')
    expect(wrap.querySelector<HTMLElement>('.qp')!.style.getPropertyValue('--shift')).toBe('168px')
  })
})
