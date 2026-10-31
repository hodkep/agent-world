// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OfficeRail } from './OfficeRail'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const agents = [
  { id: 'a1', name: 'nova', working: false },
  { id: 'a2', name: 'atlas', working: true },
  { id: 'a3', name: 'bo', working: false }
]
async function mount(over: Partial<Parameters<typeof OfficeRail>[0]> = {}) {
  const host = document.body.appendChild(document.createElement('div'))
  const onShow = vi.fn()
  const onSelect = vi.fn()
  await act(async () => createRoot(host).render(<OfficeRail agents={agents} selected="a1" marks={new Map([['a3', 'done']])} onShow={onShow} onSelect={onSelect} {...over} />))
  return { host, onShow, onSelect }
}

describe('the rail that stays when the office is hidden', () => {
  afterEach(() => void (document.body.innerHTML = ''))

  it('has a button that brings the office back', async () => {
    const { host, onShow } = await mount()
    const show = host.querySelector<HTMLButtonElement>('button[aria-label="Show the office"]')!
    await act(async () => show.click())
    expect(onShow).toHaveBeenCalledOnce()
  })

  it('has a button for each agent, named for it, with its first letter, and the one open pressed', async () => {
    const { host } = await mount()
    const dots = [...host.querySelectorAll<HTMLButtonElement>('.rail-agent')]
    expect(dots.map((d) => d.getAttribute('aria-label'))).toEqual(['nova', 'atlas', 'bo'])
    expect(dots.map((d) => d.textContent)).toEqual(['N', 'A', 'B'])
    expect(dots.map((d) => d.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false'])
  })

  it('says which agent is at work, and which needs you or has finished', async () => {
    const { host } = await mount()
    const dots = [...host.querySelectorAll<HTMLElement>('.rail-agent')]
    expect(dots.map((d) => d.classList.contains('working'))).toEqual([false, true, false])
    expect(dots[2]!.querySelector('.wt-mark.done')).not.toBeNull()
    expect(dots[0]!.querySelector('.wt-mark')).toBeNull()
  })

  it('opens an agent when its button is pressed', async () => {
    const { host, onSelect } = await mount()
    await act(async () => host.querySelectorAll<HTMLButtonElement>('.rail-agent')[1]!.click())
    expect(onSelect).toHaveBeenCalledWith('a2')
  })
})
