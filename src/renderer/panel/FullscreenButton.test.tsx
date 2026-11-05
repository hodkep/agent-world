// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FullscreenButton } from './FullscreenButton'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
async function show(hidden: boolean, onToggle = vi.fn(), keys = '⌘⌥F') {
  const host = document.body.appendChild(document.createElement('div'))
  root = createRoot(host)
  await act(async () => root!.render(<FullscreenButton hidden={hidden} onToggle={onToggle} keys={keys} />))
  return { button: host.querySelector('button')!, onToggle }
}

describe('the full screen button at the right end of the header', () => {
  afterEach(async () => {
    await act(async () => root?.unmount())
    document.body.innerHTML = ''
  })

  it('offers full screen while the bars show, and asks to hide them on a click', async () => {
    const { button, onToggle } = await show(false)
    expect(button.getAttribute('aria-label')).toBe('Full screen')
    expect(button.getAttribute('aria-pressed')).toBe('false')
    expect(button.getAttribute('data-tip')).toMatch(/^Full screen · .*\(⌘⌥F\)$/)
    await act(async () => button.click())
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('offers to leave it, and shows as on, while the bars are hidden', async () => {
    const { button, onToggle } = await show(true)
    expect(button.getAttribute('aria-label')).toBe('Exit full screen')
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(button.getAttribute('data-tip')).toMatch(/^Exit full screen · .*\(⌘⌥F\)$/)
    await act(async () => button.click())
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})
