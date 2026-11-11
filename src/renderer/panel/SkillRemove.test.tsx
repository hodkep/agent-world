// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SkillRemoveFrom } from './SkillOverview'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const click = (el: Element | null | undefined) => act(async () => void (el as HTMLElement).click())

async function mount(folder: string | undefined) {
  const shown = { steps: [{ action: 'unlink', target: 'project-claude', dir: '/w/a/.claude/skills', label: 'This project (Claude Code)' }], left: ['/w/b/.claude/skills'] }
  const aw = { library: { skillRemovalPlan: vi.fn(async () => shown), skillRemoval: vi.fn(async () => undefined) } }
  ;(window as unknown as { aw: unknown }).aw = aw
  const onChanged = vi.fn()
  const host = document.body.appendChild(document.createElement('div'))
  await act(async () => createRoot(host).render(<SkillRemoveFrom id="pdf" name="pdf" folder={folder} onChanged={onChanged} />))
  return { host, aw, shown, onChanged }
}
const btn = (host: Element, t: string) => [...host.querySelectorAll('button')].find((b) => (b.querySelector('b')?.textContent ?? b.textContent) === t)

describe('taking a skill out of folders', () => {
  afterEach(() => void (document.body.innerHTML = ''))

  it('offers this project only when one is open, then every project, global, everywhere, and keeping one global', async () => {
    const open = await mount('/w/a')
    expect([...open.host.querySelectorAll('button b')].map((b) => b.textContent)).toEqual(['This project', 'Every project', 'Global', 'Everywhere', 'Keep one global, remove the project ones'])
    document.body.innerHTML = ''
    const none = await mount(undefined)
    expect(btn(none.host, 'This project')).toBeUndefined()
  })

  it('shows the folders and the ones left alone, then removes with the plan it showed', async () => {
    const { host, aw, shown, onChanged } = await mount('/w/a')
    await click(btn(host, 'This project'))
    expect(aw.library.skillRemovalPlan).toHaveBeenCalledWith('pdf', { scope: 'project', folder: '/w/a' })
    expect(host.querySelector('[role="alertdialog"]')!.textContent).toContain('/w/a/.claude/skills')
    expect(host.querySelector('[role="alertdialog"]')!.textContent).toContain('/w/b/.claude/skills')
    await click(btn(host.querySelector('[role="alertdialog"]')!, 'Remove'))
    expect(aw.library.skillRemoval).toHaveBeenCalledWith('pdf', { scope: 'project', folder: '/w/a' }, shown)
    expect(onChanged).toHaveBeenCalled()
  })

  it('keeping one global says it links it first', async () => {
    const { host, aw } = await mount('/w/a')
    await click(btn(host, 'Keep one global, remove the project ones'))
    expect(aw.library.skillRemovalPlan).toHaveBeenCalledWith('pdf', { scope: 'keep-global' })
  })
})
