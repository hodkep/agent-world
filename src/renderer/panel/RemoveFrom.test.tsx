// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RemoveFrom } from './RemoveFrom'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const click = (el: Element | null | undefined) => act(async () => void (el as HTMLElement).click())
const byText = (host: Element, t: string) => [...host.querySelectorAll('button')].find((b) => (b.querySelector('b')?.textContent ?? b.textContent) === t)
async function mount(over: Partial<Parameters<typeof RemoveFrom>[0]> = {}) {
  const commit = vi.fn(async () => undefined)
  const plan = vi.fn(async (key: string) => ({ lines: [{ text: `/w/${key}/.mcp.json`, note: 'comes with the repo' }, { text: '~/.claude.json' }], left: ['/w/keep'], commit }))
  const onDone = vi.fn()
  const host = document.body.appendChild(document.createElement('div'))
  await act(async () => createRoot(host).render(<RemoveFrom name="supabase" options={[{ key: 'projects', label: 'Remove from every project' }, { key: 'all', label: 'Remove from every place' }]} plan={plan} onDone={onDone} {...over} />))
  return { host, plan, commit, onDone }
}

describe('taking something out of several places', () => {
  afterEach(() => void (document.body.innerHTML = ''))

  it('shows exactly what would change before anything is changed, and changes nothing until told', async () => {
    const { host, plan, commit } = await mount()
    await click(byText(host, 'Remove from every project'))
    expect(plan).toHaveBeenCalledWith('projects')
    const ask = host.querySelector('[role="alertdialog"]')!
    expect(ask.textContent).toContain('/w/projects/.mcp.json')
    expect(ask.textContent).toContain('comes with the repo')
    expect(ask.textContent).toContain('/w/keep')
    expect(commit).not.toHaveBeenCalled()
  })

  it('does it on Remove and then says it is done', async () => {
    const { host, commit, onDone } = await mount()
    await click(byText(host, 'Remove from every place'))
    await click(byText(host.querySelector('[role="alertdialog"]')!, 'Remove'))
    expect(commit).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalled()
    expect(host.querySelector('[role="alertdialog"]')).toBeNull()
  })

  it('does nothing on Cancel', async () => {
    const { host, commit } = await mount()
    await click(byText(host, 'Remove from every place'))
    await click(byText(host, 'Cancel'))
    expect(commit).not.toHaveBeenCalled()
    expect(host.querySelector('[role="alertdialog"]')).toBeNull()
  })

  it('says why in words when there is nothing to remove, and shows no question', async () => {
    const { host } = await mount({ plan: vi.fn(async () => Promise.reject(new Error("Error invoking remote method 'x': Error: It is not in any project."))) })
    await click(byText(host, 'Remove from every project'))
    expect(host.querySelector('[role="alert"]')!.textContent).toBe('It is not in any project.')
    expect(host.querySelector('[role="alertdialog"]')).toBeNull()
  })

  it('keeps the question open and says why when the removal is refused', async () => {
    const commit = vi.fn(async () => Promise.reject(new Error('The files changed since you were shown them. Look again.')))
    const { host, onDone } = await mount({ plan: vi.fn(async () => ({ lines: [{ text: '/a' }], commit })) })
    await click(byText(host, 'Remove from every place'))
    await click(byText(host.querySelector('[role="alertdialog"]')!, 'Remove'))
    expect(host.querySelector('[role="alertdialog"] [role="alert"]')!.textContent).toBe('The files changed since you were shown them. Look again.')
    expect(onDone).not.toHaveBeenCalled()
  })
})
