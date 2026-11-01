// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

  it('shows every message as a card with a line for the agent it went to, and what became of it', async () => {
    const host = await mount()
    const first = host.querySelector('.tcard')!
    expect(first.querySelector('.tc-tag')!.textContent).toBe('Message')
    expect(first.querySelector('.trace-who')!.textContent).toBe('delta → os')
    expect([...first.querySelectorAll('.bc-row')].map((r) => [r.querySelector('b')!.textContent, r.querySelector('.w')!.textContent])).toEqual([['os', 'Delivered']])
    const dropped = [...host.querySelectorAll('.tcard')].find((c) => c.textContent?.includes('Release intake'))!
    expect(dropped.querySelector('.bc-row .w')!.textContent).toBe('Dropped')
  })
})

describe('a broadcast in the Traces tab', () => {
  afterEach(() => void (document.body.innerHTML = ''))
  const crew = [{ id: 'a', name: 'delta' }, { id: 'b', name: 'os' }, { id: 'c', name: 'cocain' }, { id: 'd', name: 'tester' }] as AgentRecord[]
  const copy = (id: string, toId: string, status: AgentMessage['status'], reason?: string): AgentMessage => ({ id, fromId: 'a', toId, text: 'Rebase please', at: now, status, broadcast: 'bc1', ...(reason && { reason }) })
  const all = [copy('m1', 'b', 'delivered'), copy('m2', 'c', 'queued'), copy('m3', 'd', 'asleep', 'only the person can wake it')]

  async function open(msgs: AgentMessage[]) {
    const host = document.body.appendChild(document.createElement('div'))
    await act(async () => createRoot(host).render(<TracesView messages={msgs} agents={crew} currentId="a" />))
    return host
  }

  it('is one card for all its copies, with a line for each agent and Wake on the one asleep', async () => {
    const wakeAgent = vi.fn().mockResolvedValue(undefined)
    ;(window as unknown as { aw: unknown }).aw = { wakeAgent }
    const host = await open(all)
    expect(host.querySelectorAll('.tcard')).toHaveLength(1)
    expect(host.querySelector('.tc-tag')!.textContent).toBe('Broadcast')
    expect(host.querySelector('.trace-who')!.textContent).toBe('delta → 3 agents')
    expect([...host.querySelectorAll('.bc-row')].map((r) => [r.querySelector('b')!.textContent, r.querySelector('.w')!.textContent])).toEqual([['os', 'Delivered'], ['cocain', 'Queued'], ['tester', 'Asleep']])
    await click(host.querySelector('button.bc-wake'))
    expect(wakeAgent.mock.calls).toEqual([['d']])
  })

  it('is found by the sender or any recipient, and counts as not delivered while one is asleep', async () => {
    const host = await open([...all, msg('x', 'b', 'c', 'unrelated', now - 5000)])
    await click(chip(host, 'tester'))
    expect(host.textContent).toContain('Rebase please')
    expect(host.textContent).not.toContain('unrelated')
    await click(chip(host, 'Everyone'))
    await click(chip(host, 'Dropped only'))
    expect(host.textContent).toContain('Rebase please')
    expect(host.textContent).not.toContain('unrelated')
  })
})
