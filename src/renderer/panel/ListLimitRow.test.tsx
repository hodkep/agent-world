// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ListLimitRow } from './ListLimitRow'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const draw = async (props: { value: number; lists: number }) => {
  const onChange = vi.fn()
  const host = document.body.appendChild(document.createElement('div'))
  await act(async () => createRoot(host).render(<ListLimitRow {...props} onChange={onChange} />))
  const input = host.querySelector('input')!
  const type = (v: string) => act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, v)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  return { host, input, type, onChange }
}

describe('the most lists an agent may create', () => {
  afterEach(() => void (document.body.innerHTML = ''))

  it('shows no limit as an empty box that says so, and a limit as its number', async () => {
    const none = await draw({ value: 0, lists: 4 })
    expect(none.input.value).toBe('')
    expect(none.input.placeholder).toBe('No limit')
    expect(none.host.textContent).toContain('4 lists now')
    document.body.innerHTML = ''
    const eight = await draw({ value: 8, lists: 4 })
    expect(eight.input.value).toBe('8')
  })
  it('saves a number at or above the lists there are, and an empty box as no limit', async () => {
    const r = await draw({ value: 0, lists: 4 })
    await r.type('8')
    expect(r.onChange).toHaveBeenLastCalledWith(8)
    await r.type('4')
    expect(r.onChange).toHaveBeenLastCalledWith(4)
    await r.type('')
    expect(r.onChange).toHaveBeenLastCalledWith(0)
  })
  it('refuses a number below the lists the Todos screen has, and says why', async () => {
    const r = await draw({ value: 8, lists: 4 })
    await r.type('3')
    expect(r.onChange).not.toHaveBeenCalled()
    expect(r.host.querySelector('[role="alert"]')?.textContent).toBe('The Todos screen has 4 lists, so the limit cannot be lower than 4. It was not changed.')
    expect(r.input.getAttribute('aria-invalid')).toBe('true')
    await r.type('5')
    expect(r.host.querySelector('[role="alert"]')).toBeNull()
    expect(r.onChange).toHaveBeenLastCalledWith(5)
  })
  it('does not take a fraction or a zero as a limit', async () => {
    const r = await draw({ value: 0, lists: 0 })
    await r.type('2.5')
    await r.type('0')
    expect(r.onChange).not.toHaveBeenCalledWith(2.5)
    expect(r.onChange).not.toHaveBeenCalledWith(0.0 + 2.5)
    expect(r.host.querySelector('[role="alert"]')).not.toBeNull()
  })
})
