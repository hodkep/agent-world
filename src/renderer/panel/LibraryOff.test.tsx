// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LibraryOff } from './LibraryOff'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('the library switched off', () => {
  afterEach(() => void (document.body.innerHTML = ''))

  it('opens Settings with no pane named, not with the click event as the pane', async () => {
    const open = vi.fn()
    const host = document.body.appendChild(document.createElement('div'))
    await act(async () => createRoot(host).render(<LibraryOff onOpenSettings={open} />))
    await act(async () => void host.querySelector('button')!.click())
    expect(open).toHaveBeenCalledTimes(1)
    expect(open.mock.calls[0]).toEqual([])
  })
})
