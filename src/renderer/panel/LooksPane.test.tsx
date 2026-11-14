// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SWATCH_DEFAULT } from '../../shared/lookSwatch'
import type { ChatModState, LookVersion } from '../../shared/chatMod'
import { EMPTY_MOD } from '../../shared/chatMod'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const v = (n: number, active: boolean, extra: Partial<LookVersion> = {}): LookVersion => ({ n, by: 'ada', why: `look ${n}`, at: 1_700_000_000_000 + n, name: '', active, cssBytes: 100 * n, rules: 1, widgets: 0, swatch: SWATCH_DEFAULT, ...extra })
const state = (versions: LookVersion[], draft = false): ChatModState => ({ current: EMPTY_MOD, draft: draft ? EMPTY_MOD : null, draftBy: draft ? 'bo' : null, draftWhy: '', versions, draftData: false, recent: [] })

let aw: Record<string, ReturnType<typeof vi.fn>>
async function show(versions: LookVersion[], draft = false) {
  aw = { chatModState: vi.fn(async () => state(versions, draft)), onChatMod: vi.fn(() => () => {}), chatModSwitch: vi.fn(async () => true), chatModRename: vi.fn(async () => true), chatModRemove: vi.fn(async () => true) }
  ;(window as unknown as { aw: unknown }).aw = aw
  vi.resetModules()
  const { LooksPane } = await import('./LooksPane')
  const host = document.body.appendChild(document.createElement('div'))
  await act(async () => createRoot(host).render(<LooksPane />))
  const rows = () => [...host.querySelectorAll<HTMLButtonElement>('[role="option"]')]
  const btn = (text: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim().startsWith(text))!
  return { host, rows, btn }
}

describe('Settings, Looks', () => {
  beforeEach(() => void (document.body.innerHTML = ''))
  afterEach(() => void (document.body.innerHTML = ''))

  it('lists the system look first, then each version newest first, with the one in force marked', async () => {
    const { rows } = await show([v(3, true), v(2, false), v(1, false, { name: 'Warm paper' })])
    expect(rows().map((r) => r.querySelector('b')!.textContent)).toEqual(['System look', 'v3', 'v2', 'Warm paperv1'])
    expect(rows().map((r) => r.dataset.active)).toEqual(['false', 'true', 'false', 'false'])
  })

  it('shows the newest version that is not in force beside the one in force, and switches to it', async () => {
    const { btn, host } = await show([v(3, true), v(2, false)])
    expect(host.textContent).toContain('Selected · v2')
    expect(host.textContent).toContain('In force · v3')
    await act(async () => btn('Switch to v2').click())
    expect(aw.chatModSwitch).toHaveBeenCalledWith(2)
    expect(host.textContent).toContain('Switched to v2. v3 is saved.')
  })

  it('the note after a switch has an Undo that switches back', async () => {
    const { btn } = await show([v(3, true), v(2, false)])
    await act(async () => btn('Switch to v2').click())
    await act(async () => btn('Undo').click())
    expect(aw.chatModSwitch).toHaveBeenLastCalledWith(3)
  })

  it('cannot switch to, or delete, the one in force', async () => {
    const { rows, btn } = await show([v(3, true), v(2, false)])
    await act(async () => rows()[1]!.click())
    expect(btn('In force').disabled).toBe(true)
    expect([...document.querySelectorAll('button')].some((b) => b.textContent!.includes('Delete'))).toBe(false)
  })

  it('switches to the system look from its row', async () => {
    const { rows, btn } = await show([v(1, true)])
    await act(async () => rows()[0]!.click())
    await act(async () => btn('Switch to system look').click())
    expect(aw.chatModSwitch).toHaveBeenCalledWith('system')
  })

  it('asks before deleting, and deletes only after the second press', async () => {
    const { btn, host } = await show([v(2, true), v(1, false)])
    await act(async () => btn('Delete').click())
    expect(aw.chatModRemove).not.toHaveBeenCalled()
    expect(host.textContent).toContain('Delete v1 for good?')
    await act(async () => btn('Keep it').click())
    expect(aw.chatModRemove).not.toHaveBeenCalled()
    await act(async () => btn('Delete').click())
    await act(async () => [...host.querySelectorAll('button')].find((b) => b.textContent === 'Delete')!.click())
    expect(aw.chatModRemove).toHaveBeenCalledWith(1)
  })

  it('renames with the name typed, and Escape leaves it as it was', async () => {
    const { btn, host } = await show([v(2, true), v(1, false)])
    await act(async () => btn('Rename').click())
    const input = host.querySelector<HTMLInputElement>('input[aria-label="Name for v1"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Warm paper')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => btn('Save').click())
    expect(aw.chatModRename).toHaveBeenCalledWith(1, 'Warm paper')
    await act(async () => btn('Rename').click())
    await act(async () => void host.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(host.querySelector('input')).toBeNull()
    expect(aw.chatModRename).toHaveBeenCalledOnce()
  })

  it('says a look from an agent is waiting, and that switching drops it', async () => {
    const { host } = await show([v(1, true)], true)
    expect(host.textContent).toContain('A new look from bo is waiting for Keep or Undo. Switching drops it.')
  })

  it('is told nothing when no look waits', async () => {
    const { host } = await show([v(1, true)])
    expect(host.textContent).not.toContain('waiting for Keep')
  })
})
