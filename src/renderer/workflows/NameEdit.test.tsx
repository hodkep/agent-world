// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NameEdit } from './NameEdit'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const host = document.createElement('div')
document.body.append(host)
afterEach(() => act(() => createRoot(host).unmount()))

const show = async (onSave = vi.fn(() => Promise.resolve()), name = 'Standard') => {
  await act(async () => createRoot(host).render(<NameEdit name={name} onSave={onSave} />))
  return onSave
}
const press = (label: RegExp | string) => act(async () => void (Array.from(host.querySelectorAll('button')).find((b) => (typeof label === 'string' ? b.textContent === label : label.test(b.getAttribute('aria-label') ?? b.textContent ?? '')))!).click())
const type = (v: string) => act(async () => {
  const i = host.querySelector('input')!
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(i, v)
  i.dispatchEvent(new Event('input', { bubbles: true }))
})

describe('renaming a workflow where its name is shown', () => {
  it('shows the name and a Rename button, and no field until it is pressed', async () => {
    await show()
    expect(host.textContent).toContain('Standard')
    expect(host.querySelector('input')).toBeNull()
    await press(/Rename Standard/)
    expect(host.querySelector('input')!.value).toBe('Standard')
  })
  it('saves the trimmed name and goes back to showing the name', async () => {
    const save = await show()
    await press(/Rename/)
    await type('  Our flow ')
    await press('Save')
    expect(save).toHaveBeenCalledWith('Our flow')
    expect(host.querySelector('input')).toBeNull()
  })
  it('cannot save an empty or unchanged name, and Cancel leaves the name as it was', async () => {
    const save = await show()
    await press(/Rename/)
    expect((Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'Save') as HTMLButtonElement).disabled).toBe(true)
    await type('   ')
    expect((Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'Save') as HTMLButtonElement).disabled).toBe(true)
    await press('Cancel')
    expect(save).not.toHaveBeenCalled()
    expect(host.textContent).toContain('Standard')
  })
  it('stays open when saving fails, so the name typed is not lost', async () => {
    await show(vi.fn(() => Promise.reject(new Error('no'))))
    await press(/Rename/)
    await type('X')
    await press('Save')
    expect(host.querySelector('input')!.value).toBe('X')
  })
})
