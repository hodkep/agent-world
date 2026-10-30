// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RestartBanner } from './RestartBanner'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const aw = { workflows: { stale: vi.fn() }, reconfigure: vi.fn() }
const mount = async (folder: string | null = '/shop') => {
  const host = document.body.appendChild(document.createElement('div'))
  await act(async () => createRoot(host).render(<RestartBanner folder={folder} />))
  return host
}

describe('the banner for agents that started before the workflow was set', () => {
  beforeEach(() => {
    aw.workflows.stale.mockReset()
    aw.reconfigure.mockReset().mockResolvedValue(undefined)
    ;(window as unknown as { aw: typeof aw }).aw = aw
  })
  afterEach(() => void (document.body.innerHTML = ''))

  it('names the agents and offers to restart them, counting them in the button', async () => {
    aw.workflows.stale.mockResolvedValue([{ id: 'a1', name: 'ada' }, { id: 'a2', name: 'bo' }])
    const host = await mount()
    expect(aw.workflows.stale).toHaveBeenCalledWith('/shop')
    expect(host.textContent).toContain('2 agents started before this workflow was set.')
    expect(host.textContent).toContain('ada, bo do not have the workflow tools until they restart, so no task is recorded.')
    expect(host.querySelector('button')!.textContent).toBe('Restart 2 agents')
  })

  it('says it in the singular for one agent', async () => {
    aw.workflows.stale.mockResolvedValue([{ id: 'a1', name: 'ada' }])
    const host = await mount()
    expect(host.textContent).toContain('1 agent started before this workflow was set.')
    expect(host.textContent).toContain('ada does not have the workflow tools until it restarts, so no task is recorded.')
    expect(host.querySelector('button')!.textContent).toBe('Restart 1 agent')
  })

  it('restarts each stale agent when the button is pressed', async () => {
    aw.workflows.stale.mockResolvedValue([{ id: 'a1', name: 'ada' }, { id: 'a2', name: 'bo' }])
    const host = await mount()
    await act(async () => void host.querySelector('button')!.click())
    expect(aw.reconfigure.mock.calls).toEqual([['a1', {}], ['a2', {}]])
  })

  it('says which agent is in the middle of a turn when it cannot be restarted, and stays', async () => {
    aw.workflows.stale.mockResolvedValue([{ id: 'a1', name: 'ada' }])
    aw.reconfigure.mockRejectedValue(new Error('busy'))
    const host = await mount()
    await act(async () => void host.querySelector('button')!.click())
    expect(host.textContent).toContain('ada is in the middle of a turn. Try again when it finishes.')
    expect(host.querySelector('button')).not.toBeNull()
  })

  it('shows nothing when no agent is stale, or no project is open', async () => {
    aw.workflows.stale.mockResolvedValue([])
    expect((await mount()).querySelector('.lib-notice')).toBeNull()
    document.body.innerHTML = ''
    expect((await mount(null)).querySelector('.lib-notice')).toBeNull()
  })
})
