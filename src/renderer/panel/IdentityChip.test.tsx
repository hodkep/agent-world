// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { IdentityChip } from './IdentityChip'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const mount = async (line: { text: string; out: boolean } | null, onOpen = () => {}) => {
  const host = document.body.appendChild(document.createElement('div'))
  await act(async () => createRoot(host).render(<IdentityChip line={line} onOpen={onOpen} />))
  return host
}

describe('the identity chip', () => {
  afterEach(() => void (document.body.innerHTML = ''))

  it('shows nothing for a project with no profile', async () => expect((await mount(null)).querySelector('button')).toBeNull())

  it('says who the project acts as', async () => {
    const chip = (await mount({ text: 'as hodkep', out: false })).querySelector('button')!
    expect(chip.textContent).toBe('as hodkep')
    expect(chip.classList.contains('out')).toBe(false)
  })

  it('turns amber and says so when the login is signed out', async () => {
    const chip = (await mount({ text: 'hodkep out', out: true })).querySelector('button')!
    expect(chip.classList.contains('out')).toBe(true)
    expect(chip.title).toContain('signed out')
  })

  it('opens the project identity pane when clicked', async () => {
    const open = vi.fn()
    const chip = (await mount({ text: 'as hodkep', out: false }, open)).querySelector('button')!
    await act(async () => void chip.click())
    expect(open).toHaveBeenCalled()
  })
})
