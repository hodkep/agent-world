// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LibraryCandidate, LibraryItem } from '../../shared/library'
import { SkillBulk } from './SkillBulk'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const item = (id: string, over: Partial<LibraryItem> = {}): LibraryItem => ({ id, kind: 'skill', name: id, description: '', body: '', source: 's', files: [], dir: `/lib/skills/${id}`, tokens: { description: 1, body: 1 }, ...over })
const cand = (name: string, over: Partial<LibraryCandidate> = {}): LibraryCandidate => ({ source: '~/.claude/skills', name, description: '', dir: `/h/.claude/skills/${name}`, real: `/h/.agents/skills/${name}`, kind: 'global', ...over })

const items = [item('linked', { place: { kind: 'global', real: '/h/.agents/skills/linked' } }), item('copied', { size: { bytes: 2.5 * 1024 ** 3, at: 1 } })]
const found = [cand('caveman'), cand('pptx'), cand('linked', { real: '/h/.agents/skills/linked' })]

async function setup(mode: 'add' | 'remove') {
  const onAdd = vi.fn(async (d: string[]) => ({ text: `Added ${d.length}.` }))
  const onRemove = vi.fn(async (d: string[]) => ({ text: `Removed ${d.length}.` }))
  const onOpen = vi.fn()
  const onBack = vi.fn()
  const host = document.body.appendChild(document.createElement('div'))
  await act(async () => createRoot(host).render(<SkillBulk mode={mode} items={items} found={found} open={null} onOpen={onOpen} onBack={onBack} onAdd={onAdd} onRemove={onRemove} />))
  return { host, onAdd, onRemove, onBack, onOpen }
}
const click = (host: HTMLElement, text: string) => act(async () => void [...host.querySelectorAll('button')].find((b) => b.textContent?.startsWith(text))!.click())
const box = (host: HTMLElement, label: string) => act(async () => void (host.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement).click())

describe('adding and removing skills in bulk', () => {
  afterEach(() => void (document.body.innerHTML = ''))

  it('lists only what the library does not hold, selects all or one by one, and adds the ticked ones', async () => {
    const s = await setup('add')
    expect(s.host.textContent).toContain('caveman')
    expect(s.host.textContent).toContain('pptx')
    expect(s.host.textContent).not.toContain('linked')
    expect(s.host.textContent).toContain('Select all (2)')
    await box(s.host, 'Select all')
    await click(s.host, 'Add 2')
    expect(s.onAdd).toHaveBeenCalledWith(['/h/.claude/skills/caveman', '/h/.claude/skills/pptx'])
    await box(s.host, 'Select pptx')
    expect(s.host.textContent).toContain('Add 1')
  })

  it('goes back to the list, and has nothing to add when nothing is ticked', async () => {
    const s = await setup('add')
    expect([...s.host.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Add 0'))?.disabled).toBe(true)
    await click(s.host, '← Back')
    expect(s.onBack).toHaveBeenCalled()
  })

  it('in Remove mode lists what the library holds, says what removing does to links and to copies, and asks once before removing', async () => {
    const s = await setup('remove')
    expect(s.host.textContent).toContain('linked')
    expect(s.host.textContent).toContain('copied')
    expect(s.host.textContent).not.toContain('caveman')
    await box(s.host, 'Select all')
    expect(s.host.textContent).toMatch(/1 link is unlinked, its folder stays/)
    expect(s.host.textContent).toMatch(/1 copy is deleted from the library \(frees 2\.5 GB\)/)
    await click(s.host, 'Remove 2')
    expect(s.onRemove).not.toHaveBeenCalled()
    await click(s.host, 'No')
    expect(s.onBack).not.toHaveBeenCalled()
    expect(s.host.textContent).toContain('Remove 2')
    await click(s.host, 'Remove 2')
    await click(s.host, 'Yes, remove 2')
    expect(s.onRemove).toHaveBeenCalledWith(['linked', 'copied'])
  })

  it('has no switch between adding and removing: each screen does one thing', async () => {
    const s = await setup('add')
    expect(s.host.querySelector('[aria-label="What to do"]')).toBeNull()
    expect(s.host.textContent).toContain('Import skills from device')
  })

  it('opens a skill in the reader when its name is clicked, and ticks it when its box is', async () => {
    const s = await setup('add')
    await act(async () => void (s.host.querySelector('button[aria-label="Open caveman"]') as HTMLButtonElement).click())
    expect(s.onOpen).toHaveBeenCalledWith('/h/.claude/skills/caveman')
    expect(s.host.textContent).toContain('0 selected')
  })

  it('says what happened in a callout by the button, and takes it away by itself', async () => {
    vi.useFakeTimers()
    try {
      const s = await setup('add')
      await box(s.host, 'Select all')
      await click(s.host, 'Add 2')
      expect(document.querySelector('[role="status"]')?.textContent).toContain('Added 2.')
      await act(async () => void vi.advanceTimersByTime(3200))
      expect(document.querySelector('[role="status"]')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
