// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LibraryItem } from '../../shared/library'
import { SkillFooter } from './SkillOverview'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const item: LibraryItem = { id: 'chirp', kind: 'skill', name: 'chirp', description: '', body: '', source: 's', files: [], dir: '/lib/skills/chirp', tokens: { description: 1, body: 1 }, place: { kind: 'global', real: '/h/.claude/skills/chirp' } }
const plan = { files: [{ path: '/h/.claude/skills/chirp', bytes: 51 }], links: [], rules: 0, tracked: false }

async function setup() {
  const aw = { library: { deletePlan: vi.fn(async () => plan), delete: vi.fn(async () => undefined) } }
  ;(window as unknown as { aw: unknown }).aw = aw
  const onRemove = vi.fn()
  const onDeleted = vi.fn()
  const host = document.body.appendChild(document.createElement('div'))
  await act(async () => createRoot(host).render(<SkillFooter item={item} busy={false} onRemove={onRemove} onDeleted={onDeleted} />))
  return { aw, host, onRemove, onDeleted }
}
const click = (text: string) => act(async () => void [...document.querySelectorAll('button')].find((b) => b.textContent?.startsWith(text))!.click())

describe('deleting a skill from its footer', () => {
  afterEach(() => void (document.body.innerHTML = ''))
  it('asks in a callout over the button, not in a box in the footer, and deletes only when told', async () => {
    const s = await setup()
    await click('Delete…')
    const ask = document.querySelector('[role="alertdialog"]')!
    expect(ask.className).toContain('callout')
    expect(ask.textContent).toContain('Delete chirp?')
    expect(s.host.querySelector('.confirm')).toBeNull()
    expect(s.aw.library.delete).not.toHaveBeenCalled()
    await click('Delete 51 B')
    expect(s.aw.library.delete).toHaveBeenCalledWith('chirp', false)
    expect(s.onDeleted).toHaveBeenCalled()
  })
  it('Keep it closes the callout and nothing is deleted', async () => {
    const s = await setup()
    await click('Delete…')
    await click('Keep it')
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()
    expect(s.aw.library.delete).not.toHaveBeenCalled()
  })
})
