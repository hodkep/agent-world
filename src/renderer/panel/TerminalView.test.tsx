// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const calls: string[] = []
vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    cols = 100
    rows = 30
    buffer = { active: { viewportY: 0, baseY: 0 } }
    parser = { registerOscHandler: () => ({ dispose() {} }) }
    loadAddon() {}
    open() {}
    focus() {}
    write(t: string) {
      calls.push(`write:${t}`)
    }
    dispose() {}
    onData = () => ({ dispose() {} })
    onScroll = () => ({ dispose() {} })
    onWriteParsed = () => ({ dispose() {} })
    onResize = () => ({ dispose() {} })
    onSelectionChange = () => ({ dispose() {} })
    attachCustomKeyEventHandler() {}
    registerLinkProvider = () => ({ dispose() {} })
  }
}))
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    proposeDimensions() {
      return { cols: 100, rows: 30 }
    }
    fit() {
      calls.push('fit')
    }
  }
}))
vi.mock('@xterm/xterm/css/xterm.css', () => ({}))

import { TerminalView } from './TerminalView'

const tick = () => act(() => new Promise<void>((r) => setTimeout(r, 30)))

describe('the terminal replaying what it already holds', () => {
  const ptyBuffer = vi.fn(async () => ({ text: 'OLD', end: 3 }))
  beforeEach(() => {
    calls.length = 0
    ptyBuffer.mockClear()
    // jsdom has no layout: say the box is on show.
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', { configurable: true, get: () => document.body })
    ;(window as unknown as { aw: unknown }).aw = { ptyBuffer, onPtyData: () => () => {}, ptyWrite() {}, ptyResize() {}, terminalMenu: async () => '' }
    globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} } as unknown as typeof ResizeObserver
  })
  afterEach(() => void (document.body.innerHTML = ''))

  it('writes it only after the terminal has been fitted to its box, not at the default size', async () => {
    const host = document.body.appendChild(document.createElement('div'))
    await act(async () => createRoot(host).render(<TerminalView ptyId="p" visible focusTick={0} />))
    await tick()
    expect(calls.indexOf('fit')).toBeGreaterThanOrEqual(0)
    expect(calls.indexOf('write:OLD')).toBeGreaterThan(calls.indexOf('fit'))
  })

  it('asks for it only once the terminal is on show, so a hidden one holds nothing stale', async () => {
    const host = document.body.appendChild(document.createElement('div'))
    const root = createRoot(host)
    await act(async () => root.render(<TerminalView ptyId="p" visible={false} focusTick={0} />))
    await tick()
    expect(ptyBuffer).not.toHaveBeenCalled()
    await act(async () => root.render(<TerminalView ptyId="p" visible focusTick={0} />))
    await tick()
    expect(ptyBuffer).toHaveBeenCalledTimes(1)
  })
})
