// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { AgentMessage, AgentRecord } from '../../shared/types'
import { TracesView } from './TracesView'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const now = Date.now()
const agents = [{ id: 'a', name: 'delta' }, { id: 'b', name: 'os' }, { id: 'c', name: 'cocain' }] as AgentRecord[]
const msg = (id: string, fromId: string, toId: string, text: string, at: number, status: AgentMessage['status'] = 'delivered'): AgentMessage => ({ id, fromId, toId, text, at, status })
const messages = [
  msg('1', 'a', 'b', 'Docs-only PR raised', now),
  msg('2', 'b', 'c', 'Release intake long text '.repeat(10), now - 1000, 'dropped'),
  msg('3', 'c', 'b', 'nothing open', now - 86400000)
]

async function mount() {
  const host = document.body.appendChild(document.createElement('div'))
  await act(async () => createRoot(host).render(<TracesView messages={messages} agents={agents} currentId="c" />))
  return host
}
const click = (el: Element | null | undefined) => act(async () => void (el as HTMLElement).click())
const chip = (host: HTMLElement, name: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === name)

describe('the Traces tab', () => {
  afterEach(() => void (document.body.innerHTML = ''))

  it('groups messages under day headings', async () => {
    const host = await mount()
    expect(host.textContent).toContain('Today')
    expect(host.textContent).toContain('Yesterday')
  })

  it('filters by agent, and to the ones not delivered', async () => {
    const host = await mount()
    await click(chip(host, 'delta'))
    expect(host.textContent).toContain('Docs-only PR raised')
    expect(host.textContent).not.toContain('nothing open')
    await click(chip(host, 'Everyone'))
    await click(chip(host, 'Dropped only'))
    expect(host.textContent).toContain('Release intake')
    expect(host.textContent).not.toContain('Docs-only PR raised')
  })

  it('shows a short message by default and the whole of it when its row is clicked', async () => {
    const host = await mount()
    const row = host.querySelector('.trace-row[aria-expanded="false"]') as HTMLElement
    expect(row.querySelector('.detail.full')).toBeNull()
    await click(row)
    expect(host.querySelector('.detail.full')).not.toBeNull()
  })
})
