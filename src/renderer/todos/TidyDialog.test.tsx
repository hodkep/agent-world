// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TidyDialog } from './TidyDialog'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const plan = {
  read: 12,
  remove: [{ id: '1', title: '[Agent World] The person pressed Run: start your step "Commit" now.', why: 'echo' as const }, { id: '2', title: 'Rebase PR #130 onto main', why: 'chore' as const }],
  nest: [{ id: '4', title: 'Busy state on cards', parent: '3', parentTitle: 'Show busy state' }],
  label: [{ id: '3', title: 'Show busy state', label: 'feature' }],
  move: [] as { id: string; title: string; from: string; to: string }[]
}
const done = { removed: 2, nested: 1, labelled: 1, moved: 0, backup: '/data/todos/shop.before-tidy-2026-11-13T23-10-00-000Z.json' }

let progress: ((p: { folder: string; done: number; total: number }) => void) | undefined
const aw = { tidyPlan: vi.fn(), tidyApply: vi.fn(), tidyUndo: vi.fn(), tidyCancel: vi.fn() }
const host = () => document.body.querySelector('dialog')!
const text = () => host().textContent ?? ''
const mount = async () => {
  const el = document.body.appendChild(document.createElement('div'))
  await act(async () => createRoot(el).render(<TidyDialog folder="/shop" onClose={vi.fn()} />))
}
const press = async (name: string) => act(async () => void ([...host().querySelectorAll('button')].find((b) => b.textContent === name) as HTMLButtonElement).click())

describe('the Tidy the board dialog', () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = vi.fn()
    aw.tidyPlan.mockReset().mockResolvedValue(plan)
    aw.tidyApply.mockReset().mockResolvedValue(done)
    aw.tidyUndo.mockReset().mockResolvedValue(undefined)
    aw.tidyCancel.mockReset().mockResolvedValue(undefined)
    ;(window as unknown as { aw: unknown }).aw = { todos: aw, onTidyProgress: (cb: typeof progress) => ((progress = cb), () => undefined) }
  })
  afterEach(() => void (document.body.innerHTML = ''))

  it('shows how far the reading has got, and changes nothing while it does', async () => {
    aw.tidyPlan.mockReturnValue(new Promise(() => undefined))
    await mount()
    await act(async () => progress?.({ folder: '/shop', done: 14, total: 30 }))
    expect(text()).toContain('Reading titles 14 of 30')
    expect(text()).toContain('Nothing has been changed')
    expect(aw.tidyApply).not.toHaveBeenCalled()
  })

  it('stops the reading when it is closed before it is done, and not after', async () => {
    aw.tidyPlan.mockReturnValue(new Promise(() => undefined))
    const el = document.body.appendChild(document.createElement('div'))
    const root = createRoot(el)
    await act(async () => root.render(<TidyDialog folder="/shop" onClose={vi.fn()} />))
    await act(async () => root.unmount())
    expect(aw.tidyCancel).toHaveBeenCalledWith('/shop')
    aw.tidyCancel.mockClear()
    aw.tidyPlan.mockResolvedValue(plan)
    await mount()
    await act(async () => document.body.replaceChildren())
    expect(aw.tidyCancel).not.toHaveBeenCalled()
  })

  it('shows what it would do in four groups, with no switches, and one Apply that says what it will do', async () => {
    await mount()
    expect(aw.tidyPlan).toHaveBeenCalledWith('/shop')
    const groups = [...host().querySelectorAll('section')].map((s) => [s.getAttribute('aria-label'), s.querySelector('.n')!.textContent])
    expect(groups).toEqual([['Remove echoes and chores', '2'], ['Nest the same work under one parent', '1'], ['Label each task with its kind', '1'], ['Move out of one-off lists', '0']])
    expect(host().querySelectorAll('[role=switch], input[type=checkbox]')).toHaveLength(0)
    expect(text()).toContain('Apply will remove 2, nest 1, label 1, move 0.')
    expect(aw.tidyApply).not.toHaveBeenCalled()
  })

  it('lists what is in a group when it is opened', async () => {
    await mount()
    expect(host().querySelector('section[aria-label^="Remove"] details')!.textContent).toContain('Rebase PR #130 onto main')
    expect(host().querySelector('section[aria-label^="Nest"] details')!.textContent).toContain('under Show busy state')
  })

  it('applies the plan it showed, then says what was done, where the copy is, and offers Undo', async () => {
    await mount()
    await press('Apply')
    expect(aw.tidyApply).toHaveBeenCalledWith('/shop', plan)
    expect(text()).toContain('Removed 2, nested 1, labelled 1, moved 0')
    expect(text()).toContain('shop.before-tidy-2026-11-13T23-10-00-000Z.json')
    await press('Undo')
    expect(aw.tidyUndo).toHaveBeenCalledWith('/shop')
    expect(text()).toContain('Undone')
  })

  it('says there is nothing to tidy, with no Apply', async () => {
    aw.tidyPlan.mockResolvedValue({ read: 5, remove: [], nest: [], label: [], move: [] })
    await mount()
    expect(text()).toContain('Nothing to tidy')
    expect([...host().querySelectorAll('button')].some((b) => b.textContent === 'Apply')).toBe(false)
  })

  it('says why when the tidy could not be made or undone', async () => {
    aw.tidyPlan.mockRejectedValue(new Error("Error invoking remote method 'todos:tidy-plan': Error: No model is ready to ask: connect Claude."))
    await mount()
    expect(text()).toContain('No model is ready to ask: connect Claude.')
    expect(text()).not.toContain('Error invoking')
  })
})
