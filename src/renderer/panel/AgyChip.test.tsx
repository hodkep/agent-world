// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AgyChip } from './AgyChip'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('the note that agy is not connected', () => {
  afterEach(() => void (document.body.innerHTML = ''))

  it('is one small button that says so, holds the whole sentence in its tooltip, and opens Message box when clicked', async () => {
    const onOpen = vi.fn()
    const host = document.body.appendChild(document.createElement('div'))
    await act(async () => createRoot(host).render(<AgyChip onOpen={onOpen} />))
    const b = host.querySelector('button')!
    expect(b.textContent).toBe('agy not connected')
    expect(b.title).toContain('no line for the message they are sent')
    expect(b.title).toContain('Message box')
    await act(async () => void b.click())
    expect(onOpen).toHaveBeenCalledTimes(1)
  })
})
