// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  const onSlim = vi.fn()
  await act(async () => createRoot(host).render(<OfficeRail agents={agents} selected="a1" marks={new Map([['a3', 'done']])} slim={false} onSlim={onSlim} onShow={onShow} onSelect={onSelect} {...over} />))
  return { host, onShow, onSelect, onSlim }
}

describe('the rail that stays when the office is hidden', () => {
  afterEach(() => void (document.body.innerHTML = ''))

  it('has a button that brings the office back', async () => {
    const { host, onShow } = await mount()
    const show = host.querySelector<HTMLButtonElement>('button[aria-label="Show the office"]')!
    await act(async () => show.click())
    expect(onShow).toHaveBeenCalledOnce()
  })

  it('has a button for each agent, named for it, with its first letter, its name and its state written out, and the one open pressed', async () => {
    const { host } = await mount()
    const dots = [...host.querySelectorAll<HTMLButtonElement>('.rail-agent')]
    expect(dots.map((d) => d.getAttribute('aria-label'))).toEqual(['nova', 'atlas', 'bo'])
    expect(dots.map((d) => d.querySelector('.rail-tile')!.textContent)).toEqual(['N', 'A', 'B'])
    expect(dots.map((d) => d.querySelector('.rail-name')!.textContent)).toEqual(['nova', 'atlas', 'bo'])
    expect(dots.map((d) => d.querySelector('small')!.textContent)).toEqual(['idle', 'working', 'idle'])
    expect(dots.map((d) => d.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false'])
  })

  it('shows the way back to the office as a labelled button, with no hover card to be cut off', async () => {
    const { host } = await mount()
    const show = host.querySelector<HTMLButtonElement>('.rail-show')!
    expect(show.textContent).toContain('Office')
    expect(host.querySelector('[data-tip]')).toBeNull()
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

  it('has a button that folds the list to a narrow strip, and one that opens it again', async () => {
    const { host, onSlim } = await mount()
    const fold = host.querySelector<HTMLButtonElement>('button[aria-label="Fold the list"]')!
    expect(fold.getAttribute('aria-expanded')).toBe('true')
    await act(async () => fold.click())
    expect(onSlim).toHaveBeenCalledOnce()
    const again = await mount({ slim: true })
    const open = again.host.querySelector<HTMLButtonElement>('button[aria-label="Open the list"]')!
    expect(open.getAttribute('aria-expanded')).toBe('false')
    expect(again.host.querySelector('nav.office-rail')!.classList.contains('slim')).toBe(true)
  })

  it('names each agent in a tooltip when only its square shows, and not when the names show', async () => {
    const wide = await mount()
    expect(wide.host.querySelector('.rail-agent')!.getAttribute('title')).toBeNull()
    const slim = await mount({ slim: true })
    expect(slim.host.querySelector('.rail-agent')!.getAttribute('title')).toBe('nova')
    expect(slim.host.querySelector('.rail-show')!.getAttribute('title')).toBe('Show the office')
    const keyed = await mount({ officeKeys: '⌘⌥O' })
    expect(keyed.host.querySelector('.rail-show')!.getAttribute('title')).toBe('Show the office (⌘⌥O)')
  })

  describe('when folded, pointing at it', () => {
    beforeEach(() => void vi.useFakeTimers())
    afterEach(() => void vi.useRealTimers())
    const nav = (host: HTMLElement) => host.querySelector<HTMLElement>('nav.office-rail')!
    const over = (el: HTMLElement) => act(async () => void el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body })))
    const out = (el: HTMLElement) => act(async () => void el.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })))

    it('opens the list for as long as the pointer is on it, and closes it a moment after', async () => {
      const { host } = await mount({ slim: true })
      expect(nav(host).classList.contains('peek')).toBe(false)
      await over(nav(host))
      expect(nav(host).classList.contains('peek')).toBe(true)
      await out(nav(host))
      expect(nav(host).classList.contains('peek')).toBe(true)
      await act(async () => void vi.advanceTimersByTime(400))
      expect(nav(host).classList.contains('peek')).toBe(false)
    })

    it('stays open if the pointer comes back before it closes', async () => {
      const { host } = await mount({ slim: true })
      await over(nav(host))
      await out(nav(host))
      await over(nav(host))
      await act(async () => void vi.advanceTimersByTime(400))
      expect(nav(host).classList.contains('peek')).toBe(true)
    })

    it('opens when a button in it takes the keyboard focus, so it can be used without a pointer', async () => {
      const { host } = await mount({ slim: true })
      await act(async () => void host.querySelector<HTMLElement>('.rail-agent')!.dispatchEvent(new FocusEvent('focusin', { bubbles: true })))
      expect(nav(host).classList.contains('peek')).toBe(true)
    })

    it('does nothing when the list is already open', async () => {
      const { host } = await mount({ slim: false })
      await over(nav(host))
      expect(nav(host).classList.contains('peek')).toBe(false)
    })
  })
})
