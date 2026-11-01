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
    expect(dots.map((d) => d.querySelector('small')!.textContent)).toEqual(['idle', 'working', 'finished'])
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

  it('writes finished or what an agent asks of you in place of its state, with a red dot for an ask and a tick that marks a finished one read', async () => {
    const onRead = vi.fn()
    const { host } = await mount({ marks: new Map([['a1', 'need'], ['a3', 'done']]), asks: new Map([['a1', 'permission']]), onRead })
    const words = [...host.querySelectorAll('.rail-agent small')].map((x) => x.textContent)
    expect(words).toEqual(['permission', 'working', 'finished'])
    expect(host.querySelector('.rail-agent .wt-mark.need')).not.toBeNull()
    expect(host.querySelectorAll('button[aria-label^="Mark "]')).toHaveLength(1)
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Mark bo as read"]')!.click())
    expect(onRead).toHaveBeenCalledWith('a3')
    expect(onRead).toHaveBeenCalledTimes(1)
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

    it('opens as wide as the open list is, the dragged width included', async () => {
      const { host } = await mount({ slim: true, width: 300, onWidth: () => {} })
      await over(nav(host))
      expect(nav(host).style.width).toBe('300px')
      expect(nav(host).style.marginRight).toBe('-240px')
      const plain = await mount({ slim: true })
      await over(nav(plain.host))
      expect(nav(plain.host).style.width).toBe('224px')
    })

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

  describe('the agents, each with its own face and what it is doing', () => {
    const three = [
      { id: 'a1', name: 'nova', working: false, state: 'waiting' as const, role: 'senior' as const },
      { id: 'a2', name: 'atlas', working: true, state: 'working' as const, role: 'boss' as const },
      { id: 'a3', name: 'bo', working: false, state: 'asleep' as const, role: 'senior' as const },
      { id: 'a4', name: 'cy', working: false, state: 'idle' as const, role: 'intern' as const }
    ]
    it('draws a face for each, and a speech bubble for the ones that wait for you, work or sleep, none for one that is idle', async () => {
      const { host } = await mount({ agents: three, marks: new Map() })
      const rows = [...host.querySelectorAll('.rail-agent')]
      expect(rows.every((r) => r.querySelector('.rail-tile canvas'))).toBe(true)
      expect(rows.map((r) => r.querySelector('.rail-bubble')?.textContent ?? '')).toEqual(['?', '...', 'zz', ''])
      expect(rows.map((r) => r.querySelector('small')!.textContent)).toEqual(['waiting for you', 'working', 'asleep', 'idle'])
    })
    it('keeps the caption row when folded: the word Agents open, the number of agents folded, in the same place', async () => {
      const open = await mount({ agents: three })
      expect(open.host.querySelector('.rail-cap')!.textContent).toBe('Agents')
      document.body.innerHTML = ''
      const folded = await mount({ agents: three, slim: true })
      expect(folded.host.querySelector('.rail-cap')!.textContent).toBe('4')
      expect([...folded.host.querySelectorAll('.rail-agent')].length).toBe(4)
    })
  })

  describe('the allowance of the selected agent\'s account, on a board at the bottom', () => {
    const usage = { five: { pct: 36, level: 'ok' as const, reset: '2h 10m' }, week: { pct: 81, level: 'warn' as const, reset: '3d 4h' }, account: 'work' }
    it('says how much is left of the 5-hour and the weekly allowance, and when each resets', async () => {
      const { host } = await mount({ usage })
      const block = host.querySelector('.rail-usage')!
      expect(block.textContent).toContain('work')
      const rows = [...block.querySelectorAll('.ru-row')]
      expect(rows.map((r) => r.querySelector('.ru-lb')!.textContent)).toEqual(['5H', 'WK'])
      expect(rows.map((r) => r.querySelector('.ru-left')!.textContent)).toEqual(['64%', '19%'])
      expect(rows.map((r) => r.querySelector('.ru-reset')!.textContent)).toEqual(['resets in 2h 10m', 'resets in 3d 4h'])
      expect(rows[1]!.className).toContain('warn')
      expect(rows.map((r) => r.querySelectorAll('.ru-seg.on').length)).toEqual([8, 2])
    })
    it('shows a dash for an allowance with no reading, and nothing at all without usage', async () => {
      const none = { pct: null, level: 'ok' as const, reset: '' }
      const { host } = await mount({ usage: { five: none, week: none } })
      expect([...host.querySelectorAll('.ru-left')].map((x) => x.textContent)).toEqual(['—', '—'])
      document.body.innerHTML = ''
      const again = await mount()
      expect(again.host.querySelector('.rail-usage')).toBeNull()
    })
    it('is two thin bars when the list is folded', async () => {
      const { host } = await mount({ usage, slim: true })
      expect(host.querySelectorAll('.rail-usage .ru-bar').length).toBe(2)
    })
  })

  describe('the separator that sets how wide the open rail is', () => {
    it('is there while the list is open, and not while it is folded', async () => {
      const open = await mount({ width: 224, onWidth: vi.fn() })
      expect(open.host.querySelector('[role="separator"]')).not.toBeNull()
      document.body.innerHTML = ''
      const folded = await mount({ slim: true, width: 224, onWidth: vi.fn() })
      expect(folded.host.querySelector('[role="separator"]')).toBeNull()
    })
    it('moves 20px with the arrow keys, within 176 and 360, and goes back to the default on a double-click', async () => {
      const onWidth = vi.fn()
      const { host } = await mount({ width: 224, onWidth })
      const sep = host.querySelector<HTMLElement>('[role="separator"]')!
      await act(async () => void sep.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
      expect(onWidth).toHaveBeenLastCalledWith(244)
      await act(async () => void sep.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })))
      expect(onWidth).toHaveBeenLastCalledWith(204)
      document.body.innerHTML = ''
      const edge = await mount({ width: 356, onWidth })
      await act(async () => void edge.host.querySelector<HTMLElement>('[role="separator"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
      expect(onWidth).toHaveBeenLastCalledWith(360)
      await act(async () => void edge.host.querySelector<HTMLElement>('[role="separator"]')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })))
      expect(onWidth).toHaveBeenLastCalledWith(null)
    })
  })

  describe('the Terminal button at the bottom', () => {
    it('is there with a name, pressed while the terminal pane is open, and calls back when pressed', async () => {
      const onTerminal = vi.fn()
      const { host } = await mount({ terminalOpen: false, onTerminal })
      const btn = host.querySelector<HTMLButtonElement>('button.rail-term')!
      expect(btn.textContent).toContain('Terminal')
      expect(btn.getAttribute('aria-pressed')).toBe('false')
      await act(async () => btn.click())
      expect(onTerminal).toHaveBeenCalledOnce()
      document.body.innerHTML = ''
      const open = await mount({ terminalOpen: true, onTerminal })
      expect(open.host.querySelector('button.rail-term')!.getAttribute('aria-pressed')).toBe('true')
    })
    it('is only there when the rail is given a way to open the terminal, and sits above Fold', async () => {
      const without = await mount()
      expect(without.host.querySelector('button.rail-term')).toBeNull()
      document.body.innerHTML = ''
      const { host } = await mount({ terminalOpen: false, onTerminal: vi.fn() })
      const order = [...host.querySelectorAll('button.rail-term, button.rail-fold')].map((b) => b.className.split(' ')[0])
      expect(order).toEqual(['rail-term', 'rail-fold'])
    })
  })
})
