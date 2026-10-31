// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const at = (m: number) => new Date(2026, 9, 31, 10, m).getTime()
vi.mock('../chat/LibrarySlips', () => ({
  useLibraryUses: () => ({
    items: new Map([['x', { name: 'tdd' }], ['y', { name: 'code-review' }]]),
    uses: [
      { id: 'x', how: 'started', launch: 'L', t: at(0), words: 'Always follow' },
      { id: 'x', how: 'triggered', launch: 'L', t: at(5) },
      { id: 'y', how: 'triggered', launch: 'L', t: at(9) }
    ]
  })
}))
import { AgentLibrary } from './AgentLibrary'

async function mount() {
  const host = document.body.appendChild(document.createElement('div'))
  await act(async () => createRoot(host).render(<AgentLibrary agentId="a" agentName="cocain" enabled onOpenSettings={() => {}} />))
  return host
}
const titles = (host: HTMLElement) => [...host.querySelectorAll('.lib-step .tx > span')].map((e) => e.textContent)

describe('what it did, in the Library tab', () => {
  afterEach(() => void (document.body.innerHTML = ''))

  it('sits in a box of its own that scrolls, with the count of events in its header', async () => {
    const host = await mount()
    const box = host.querySelector('.al-did')!
    expect(box.querySelector('.al-scroll .lib-rail')).not.toBeNull()
    expect(box.querySelector('header')!.textContent).toMatch(/3 events/)
  })

  it('lists the newest first, and the oldest first when asked', async () => {
    const host = await mount()
    const newest = titles(host)
    await act(async () => void [...host.querySelectorAll('.al-did header button')].find((b) => b.textContent === 'Oldest')!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(titles(host)).toEqual([...newest].reverse())
  })
})
