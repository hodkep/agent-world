// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useClock } from './useClock'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let renders = 0
function Probe({ on }: { on: boolean }) {
  const now = useClock(on)
  renders++
  return <span>{now}</span>
}
const mount = async (on: boolean) => {
  const host = document.body.appendChild(document.createElement('div'))
  const root = createRoot(host)
  await act(async () => root.render(<Probe on={on} />))
  return { host, root }
}

describe('a clock that ticks only while it is wanted', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // jsdom's document is never focused; these tests are about a window in use.
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    renders = 0
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('ticks once a second while on', async () => {
    await mount(true)
    const before = renders
    for (let i = 0; i < 3; i++) await act(async () => void vi.advanceTimersByTime(1000))
    expect(renders - before).toBe(3)
  })

  it('does not tick at all while off, so a chat that is not showing is not redrawn every second', async () => {
    await mount(false)
    const before = renders
    await act(async () => void vi.advanceTimersByTime(10_000))
    expect(renders).toBe(before)
  })

  it('does not tick while the window is in the background', async () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    await mount(true)
    const before = renders
    await act(async () => void vi.advanceTimersByTime(10_000))
    expect(renders).toBe(before)
  })

  it('shows the time again at once when it comes on, and stops when it goes off', async () => {
    const { root } = await mount(false)
    vi.setSystemTime(Date.now() + 60_000)
    await act(async () => root.render(<Probe on />))
    const after = renders
    for (let i = 0; i < 2; i++) await act(async () => void vi.advanceTimersByTime(1000))
    expect(renders - after).toBe(2)
    await act(async () => root.render(<Probe on={false} />))
    const off = renders
    await act(async () => void vi.advanceTimersByTime(5000))
    expect(renders).toBe(off)
  })
})
