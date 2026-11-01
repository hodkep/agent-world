// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ViewTab } from './ViewTab'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mount = async (props: Partial<Parameters<typeof ViewTab>[0]> = {}) => {
  const host = document.body.appendChild(document.createElement('div'))
  const onClick = vi.fn()
  await act(async () => createRoot(host).render(<ViewTab icon="terminal" label="Terminal" about="The agent's own terminal" number={2} selected={false} onClick={onClick} mac {...props} />))
  const tab = host.querySelector<HTMLButtonElement>('[role="tab"]')!
  return { host, tab, onClick }
}
const hover = (tab: Element, type: 'mouseover' | 'mouseout') => act(async () => void tab.dispatchEvent(new MouseEvent(type, { bubbles: true, relatedTarget: type === 'mouseout' ? document.body : null })))

describe('a view tab shown as an icon', () => {
  afterEach(() => void (document.body.innerHTML = ''))

  it('is an icon with a label that only the selected one shows, named for assistive tools, and tells whether it is selected', async () => {
    const { tab } = await mount({ selected: true })
    expect(tab.querySelector('svg')).not.toBeNull()
    // The words are drawn for the eye (the styles show them on the selected tab, or all of them when there is room); the name for assistive tools is the button's own.
    expect(tab.querySelector('.vt-label')!.textContent).toBe('Terminal')
    expect(tab.querySelector('.vt-label')!.getAttribute('aria-hidden')).toBe('true')
    expect(tab.getAttribute('aria-label')).toBe('Terminal')
    expect(tab.getAttribute('aria-selected')).toBe('true')
  })

  it('is marked as named when it stands for a file, so its name stays visible whatever the width', async () => {
    const plain = await mount({ selected: false })
    expect(plain.tab.className).not.toContain('named')
    document.body.innerHTML = ''
    const file = await mount({ selected: false, named: true, label: 'poster.png' })
    expect(file.tab.className).toContain('named')
    expect(file.tab.querySelector('.vt-label')!.textContent).toBe('poster.png')
  })

  it('shows its label, what it is for and the key that jumps to it on hover, and not otherwise', async () => {
    const { host, tab } = await mount()
    expect(host.querySelector('.vt-tip')).toBeNull()
    await hover(tab, 'mouseover')
    const tip = host.querySelector('.vt-tip')!
    expect(tip.querySelector('b')!.textContent).toBe('Terminal')
    expect(tip.textContent).toContain("The agent's own terminal")
    expect(tip.querySelector('kbd')!.textContent).toBe('⌘⌥2')
    await hover(tab, 'mouseout')
    expect(host.querySelector('.vt-tip')).toBeNull()
  })

  it('shows the same card when keyboard focus arrives, and takes it away when it leaves', async () => {
    const { host, tab } = await mount()
    await act(async () => tab.focus())
    expect(host.querySelector('.vt-tip')).not.toBeNull()
    await act(async () => tab.blur())
    expect(host.querySelector('.vt-tip')).toBeNull()
  })

  it('names the keys as the keyboard has them, and shows any other key the tab has', async () => {
    const win = await mount({ mac: false, keys: ['Ctrl+`'] })
    await hover(win.tab, 'mouseover')
    expect([...win.host.querySelectorAll('kbd')].map((k) => k.textContent)).toEqual(['Ctrl+Alt+2', 'Ctrl+`'])
  })

  it('has no jump key past the ninth tab', async () => {
    const { host, tab } = await mount({ number: 10 })
    await hover(tab, 'mouseover')
    expect(host.querySelector('kbd')).toBeNull()
  })

  it('keeps its state on the icon: a count, or a dot, and the accessible name says it', async () => {
    const count = await mount({ label: 'Traces', name: 'Traces 3', badge: 3 })
    expect(count.tab.querySelector('.vt-badge')!.textContent).toBe('3')
    expect(count.tab.getAttribute('aria-label')).toBe('Traces 3')
    document.body.innerHTML = ''
    const dot = await mount({ label: 'Preview', name: 'Preview ●', dot: 'live' })
    expect(dot.tab.querySelector('.vt-dot.live')).not.toBeNull()
  })

  it('is pressed with a click', async () => {
    const { tab, onClick } = await mount()
    await act(async () => tab.click())
    expect(onClick).toHaveBeenCalledOnce()
  })
})
