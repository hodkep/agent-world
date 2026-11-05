// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Callout } from './Callout'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const rect = { left: 40, top: 400, bottom: 430, right: 100, width: 60, height: 30, x: 40, y: 400, toJSON: () => ({}) } as DOMRect

describe('the callout over a button', () => {
  afterEach(() => void (document.body.innerHTML = ''))
  it('takes itself away after its seconds, as a status', async () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    const host = document.body.appendChild(document.createElement('div'))
    await act(async () => createRoot(host).render(<Callout at={rect} seconds={3} onClose={onClose}>Removed 3.</Callout>))
    expect(document.querySelector('[role="status"]')?.textContent).toBe('Removed 3.')
    await act(async () => void vi.advanceTimersByTime(3100))
    expect(onClose).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
  it('a question stays until Escape or a click outside it, and a click inside does not close it', async () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    const host = document.body.appendChild(document.createElement('div'))
    await act(async () => createRoot(host).render(<Callout at={rect} tone="ask" onClose={onClose}><button>Yes</button></Callout>))
    await act(async () => void vi.advanceTimersByTime(10_000))
    expect(onClose).not.toHaveBeenCalled()
    await act(async () => void document.querySelector('button')!.dispatchEvent(new Event('pointerdown', { bubbles: true })))
    expect(onClose).not.toHaveBeenCalled()
    await act(async () => void document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })))
    expect(onClose).toHaveBeenCalledTimes(1)
    await act(async () => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(onClose).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
})
