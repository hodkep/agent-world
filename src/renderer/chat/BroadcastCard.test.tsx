// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BroadcastRows, BroadcastSentCard, broadcastTag } from './BroadcastCard'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const answer = 'Broadcast to 3 agents (id b1):\nlinus: delivered\ngrace: queued (busy: it gets this when its turn ends)\ntester: asleep (only the person can wake it)\n\nReplies arrive as messages from each agent as it finishes; there is nothing to wait for.'
const run = (result?: { text: string; isError: boolean }) => ({ name: 'mcp__agent-world__broadcast_message', input: { message: 'Rebase please.' }, ...(result && { result }) })

describe('the sender\'s broadcast card in the chat', () => {
  afterEach(() => void (document.body.innerHTML = ''))

  it('says how many got it, shows the words once and a line for each agent, with Wake for the one asleep', async () => {
    const wakeAgent = vi.fn().mockResolvedValue(undefined)
    ;(window as unknown as { aw: unknown }).aw = { wakeAgent, listAgents: vi.fn().mockResolvedValue([{ id: 'a1', name: 'ada', repoPath: '/shop' }, { id: 'z4', name: 'tester', repoPath: '/elsewhere' }, { id: 'a4', name: 'tester', repoPath: '/shop' }, { id: 'a2', name: 'linus', repoPath: '/shop' }]) }
    const host = document.body.appendChild(document.createElement('div'))
    await act(async () => createRoot(host).render(<BroadcastSentCard agentId="a1" run={run({ text: answer, isError: false })} />))
    expect(host.querySelector('article')!.getAttribute('aria-label')).toBe('Broadcast to 3 agents')
    expect(host.querySelector('.mail-tag')!.textContent).toBe('2 got it')
    expect(host.querySelector('.mail-body')!.textContent).toBe('Rebase please.')
    const lines = [...host.querySelectorAll('.bc-row')].map((r) => [r.querySelector('b')!.textContent, r.querySelector('.w')!.textContent])
    expect(lines).toEqual([['linus', 'Delivered'], ['grace', 'Queued'], ['tester', 'Asleep']])
    await act(async () => void (host.querySelector('button.bc-wake') as HTMLButtonElement).click())
    // Two agents are called tester, in two projects: the one in the sender's project is woken.
    expect(wakeAgent.mock.calls).toEqual([['a4']])
  })

  it('shows Sending while it waits and the reason when it failed', async () => {
    const host = document.body.appendChild(document.createElement('div'))
    await act(async () => createRoot(host).render(<BroadcastSentCard agentId="a1" run={run()} />))
    expect(host.querySelector('.mail-tag')!.textContent).toBe('Sending…')
    await act(async () => createRoot(host).render(<BroadcastSentCard agentId="a1" run={run({ text: 'There is no other agent in this project to tell.', isError: true })} />))
    expect(host.querySelector('.mail-tag')!.textContent).toBe('Not sent')
    expect(host.textContent).toContain('no other agent')
  })
})

describe('broadcastTag', () => {
  it('counts the agents that were sent it', () => {
    expect(broadcastTag([{ name: 'a', status: 'delivered', reason: '' }, { name: 'b', status: 'asleep', reason: '' }, { name: 'c', status: 'limit', reason: '' }])).toBe('1 got it')
    expect(broadcastTag([])).toBe('Nobody')
  })
})

describe('BroadcastRows', () => {
  it('has a line for each agent with its reason', async () => {
    const host = document.body.appendChild(document.createElement('div'))
    await act(async () => createRoot(host).render(<BroadcastRows rows={[{ name: 'mira', status: 'limit', reason: '6 messages in 10 minutes with you' }]} />))
    expect(host.querySelector('.bc-row')!.textContent).toContain('Not sent')
    expect(host.querySelector('.bc-row .why')!.textContent).toBe('6 messages in 10 minutes with you')
  })
})
