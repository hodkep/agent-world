// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Use } from '../../shared/library'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const use = { t: 1, agent: 'a', name: 'ada', provider: 'claude', workspace: 'w', id: 'tdd', how: 'fetched' } as Use

async function mount(uses: Use[]) {
  vi.resetModules()
  const list = vi.fn(async () => ({ items: [{ id: 'tdd', name: 'tdd' }] as never[], usage: {} as never }))
  ;(window as unknown as { aw: unknown }).aw = { library: { uses: vi.fn(async () => uses), list }, onLibraryUse: () => () => undefined }
  const { useLibraryUses } = await import('./LibrarySlips')
  const seen: { items: Map<string, unknown> }[] = []
  function Probe({ id }: { id: string }) {
    seen.push(useLibraryUses(id))
    return null
  }
  const host = document.body.appendChild(document.createElement('div'))
  await act(async () => createRoot(host).render(<><Probe id="a" /><Probe id="b" /></>))
  return { list, seen }
}

describe('what a chat asks the library for', () => {
  afterEach(() => void (document.body.innerHTML = ''))

  it('nothing but its own uses while the library has done nothing for the agent: the whole list of skills is not read for an empty chat', async () => {
    const { list } = await mount([])
    expect(list).not.toHaveBeenCalled()
  })
  it('one list of items for every chat that has something to say', async () => {
    const { list, seen } = await mount([use])
    expect(list).toHaveBeenCalledTimes(1)
    expect(seen.at(-1)!.items.get('tdd')).toBeDefined()
  })
})
