// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Choice } from './Choice'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const options = [{ value: 'none', label: 'A step of work' }, { value: 'plan', label: 'The plan' }]

describe('a dropdown drawn by the app', () => {
  afterEach(() => void (document.body.innerHTML = ''))
  const mount = async (onChange = vi.fn()) => {
    const host = document.body.appendChild(document.createElement('div'))
    await act(async () => createRoot(host).render(<Choice ariaLabel="Part of step 2" value="none" options={options} onChange={onChange} />))
    return { host, onChange }
  }

  it('shows the chosen option closed, opens a list of all of them, and sends the one picked', async () => {
    const { host, onChange } = await mount()
    const button = host.querySelector('button')!
    expect(button.textContent).toContain('A step of work')
    expect(button.getAttribute('aria-expanded')).toBe('false')
    await act(async () => button.click())
    expect([...host.querySelectorAll('[role=option]')].map((o) => o.textContent)).toEqual(['A step of work', 'The plan'])
    expect(host.querySelector('[aria-selected=true]')!.textContent).toContain('A step of work')
    await act(async () => (host.querySelectorAll('[role=option]')[1] as HTMLElement).click())
    expect(onChange).toHaveBeenCalledWith('plan')
    expect(host.querySelector('[role=listbox]')).toBeNull()
  })

  it('closes on Escape or a press outside, without choosing', async () => {
    const { host, onChange } = await mount()
    await act(async () => host.querySelector('button')!.click())
    await act(async () => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(host.querySelector('[role=listbox]')).toBeNull()
    await act(async () => host.querySelector('button')!.click())
    await act(async () => void document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })))
    expect(host.querySelector('[role=listbox]')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })
})
