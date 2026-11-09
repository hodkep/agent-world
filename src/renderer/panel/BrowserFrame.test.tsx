// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrowserFrame } from './BrowserFrame'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
async function show(p: { who?: string; connections?: number; at?: number; method?: string; now?: number; action?: { pill: string; target?: string; refused?: boolean }; size?: { w: number; h: number; label: string } | null; onDisconnect?: () => void }) {
  const host = document.body.appendChild(document.createElement('div'))
  root = createRoot(host)
  const onDisconnect = p.onDisconnect ?? vi.fn()
  await act(async () => root!.render(<BrowserFrame who={p.who ?? 'csr-1'} connections={p.connections ?? 1} at={p.at ?? 0} method={p.method} now={p.now ?? 10_000} action={p.action} size={p.size} onDisconnect={onDisconnect} />))
  return { host, onDisconnect }
}

describe('the frame round a page an agent’s browser tool is using', () => {
  afterEach(async () => {
    await act(async () => root?.unmount())
    document.body.innerHTML = ''
  })

  it('shows nothing when no tool is connected', async () => {
    const { host } = await show({ connections: 0 })
    expect(host.innerHTML).toBe('')
  })

  it('names the agent and says it is connected while quiet', async () => {
    const { host } = await show({ at: 0, now: 10_000 })
    expect(host.querySelector('.browser-frame')!.classList.contains('acting')).toBe(false)
    expect(host.querySelector('.browser-tab')!.textContent).toContain('csr-1 is connected')
  })

  it('says it is browsing, and lights the frame, when a command ran in the last two seconds', async () => {
    const { host } = await show({ at: 9_000, now: 10_000, method: 'Input.dispatchMouseEvent' })
    expect(host.querySelector('.browser-frame')!.classList.contains('acting')).toBe(true)
    expect(host.querySelector('.browser-tab')!.textContent).toContain('csr-1 is browsing')
  })

  it('goes quiet again by itself once two seconds pass without a command', async () => {
    vi.useFakeTimers()
    const now = Date.now()
    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () => root!.render(<BrowserFrame who="csr-1" connections={1} at={now} onDisconnect={() => {}} />))
    expect(host.querySelector('.browser-frame')!.classList.contains('acting')).toBe(true)
    await act(async () => void vi.advanceTimersByTime(2100))
    expect(host.querySelector('.browser-frame')!.classList.contains('acting')).toBe(false)
    vi.useRealTimers()
  })

  it('disconnects from the tab’s cross, with a name that says whose tool', async () => {
    const { host, onDisconnect } = await show({})
    const x = host.querySelector('button')!
    expect(x.getAttribute('aria-label')).toBe('Disconnect csr-1’s browser tool')
    await act(async () => x.click())
    expect(onDisconnect).toHaveBeenCalledTimes(1)
  })

  it('says how many tools when there are several', async () => {
    const { host } = await show({ connections: 2 })
    expect(host.querySelector('.browser-tab')!.textContent).toContain('2 tools')
  })

  describe('what the agent is doing, in the tab', () => {
    it('says it in a pill, and what it is done to beside it, while a command has just run', async () => {
      const { host } = await show({ at: 9_500, now: 10_000, action: { pill: 'CLICKING', target: '“Sign in”' } })
      const tab = host.querySelector('.browser-tab')!
      expect(tab.querySelector('.pill')!.textContent).toBe('CLICKING')
      expect(tab.querySelector('.tgt')!.textContent).toBe('“Sign in”')
      expect(tab.textContent).toContain('csr-1')
      expect(tab.getAttribute('aria-label')).toBe('csr-1 is clicking “Sign in”')
    })

    it('has only the pill when there is nothing the action is done to', async () => {
      const { host } = await show({ at: 9_500, now: 10_000, action: { pill: 'RELOADING' } })
      expect(host.querySelector('.pill')!.textContent).toBe('RELOADING')
      expect(host.querySelector('.tgt')).toBeNull()
    })

    it('says what it did last while quiet', async () => {
      const { host } = await show({ at: 0, now: 10_000, action: { pill: 'SCREENSHOT', target: 'the page' } })
      expect(host.querySelector('.pill')).toBeNull()
      expect(host.querySelector('.browser-tab')!.textContent).toContain('csr-1 is connected')
      expect(host.querySelector('.browser-tab')!.textContent).toContain('last: taking a screenshot of the page')
    })

    it('shows a refusal in red', async () => {
      const { host } = await show({ at: 9_500, now: 10_000, action: { pill: 'DROP FILE', target: 'not allowed here', refused: true } })
      expect(host.querySelector('.browser-tab')!.classList.contains('refused')).toBe(true)
      expect(host.querySelector('.tgt')!.textContent).toBe('not allowed here')
    })

    it('shows the size the agent set while it is connected, and nothing once it put it back or left', async () => {
      const set = await show({ size: { w: 390, h: 844, label: 'phone' } })
      expect(set.host.querySelector('.browser-size')!.textContent).toBe('390 × 844 · phone')
      await act(async () => root?.unmount())
      document.body.innerHTML = ''
      const back = await show({ size: null })
      expect(back.host.querySelector('.browser-size')).toBeNull()
      await act(async () => root?.unmount())
      document.body.innerHTML = ''
      const left = await show({ connections: 0, size: { w: 390, h: 844, label: 'phone' } })
      expect(left.host.innerHTML).toBe('')
    })
  })
})
