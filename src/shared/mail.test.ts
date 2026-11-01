import { describe, expect, it } from 'vitest'
import { formatBroadcast, formatDelivery } from '../main/mailbox'
import { formatBroadcastResult, parseAgentMail, parseBroadcastResult } from './mail'

describe('parseAgentMail', () => {
  it('reads what formatDelivery wrote when a reply is wanted', () => {
    const text = formatDelivery('grace', 'Please fix the role menu.\nSecond line.', true)
    expect(parseAgentMail(text)).toEqual({ from: 'grace', body: 'Please fix the role menu.\nSecond line.', expectsReply: true })
  })

  it('reads what formatDelivery wrote for a reply that needs no answer', () => {
    expect(parseAgentMail(formatDelivery('ada', 'Two nits, no blockers.', false))).toEqual({ from: 'ada', body: 'Two nits, no blockers.', expectsReply: false })
  })

  it('keeps a colon inside the body', () => {
    expect(parseAgentMail(formatDelivery('ada', 'Fix: mark it: done', true))?.body).toBe('Fix: mark it: done')
  })

  it('still reads a message whose instruction line is missing', () => {
    expect(parseAgentMail('[Agent World] Message from ada: hello')).toEqual({ from: 'ada', body: 'hello', expectsReply: false })
  })

  it('leaves everything else alone', () => {
    expect(parseAgentMail('please review auth.ts')).toBeNull()
    expect(parseAgentMail('see [Agent World] Message from ada: hi')).toBeNull()
  })
})

describe('a broadcast as the recipient reads it', () => {
  it('reads who sent it, who else was told, and that a reply is wanted', () => {
    expect(parseAgentMail(formatBroadcast('ada', 'Rebase please.', true, ['linus', 'grace']))).toEqual({ from: 'ada', body: 'Rebase please.', expectsReply: true, broadcast: { also: ['linus', 'grace'] } })
  })
  it('reads one that went to no one else, and one that wants no reply', () => {
    expect(parseAgentMail(formatBroadcast('ada', 'FYI', false, []))).toEqual({ from: 'ada', body: 'FYI', expectsReply: false, broadcast: { also: [] } })
  })
})

describe('parseBroadcastResult: what the sender\'s tool answered, a line for each agent', () => {
  it('reads each agent with its state and reason', () => {
    const text = 'Broadcast to 3 agents (id b1):\nlinus: delivered\ngrace: queued (busy: it gets this when its turn ends)\ntester: asleep (only the person can wake it)\n\nReplies arrive as messages.'
    expect(parseBroadcastResult(text)).toEqual({ id: 'b1', rows: [{ name: 'linus', status: 'delivered', reason: '' }, { name: 'grace', status: 'queued', reason: 'busy: it gets this when its turn ends' }, { name: 'tester', status: 'asleep', reason: 'only the person can wake it' }] })
  })
  it('is null for anything else', () => {
    expect(parseBroadcastResult('Delivered to linus.')).toBeNull()
  })
})

describe('formatBroadcastResult: the sender is told who got it, and can be read back', () => {
  const rows = [{ name: 'linus', status: 'delivered' as const, reason: '' }, { name: 'grace', status: 'queued' as const, reason: '' }, { name: 'tester', status: 'asleep' as const, reason: 'only the person can wake it' }]
  it('has a line for each agent, says what to expect, and reads back as the same rows', () => {
    const text = formatBroadcastResult('b1', rows)
    expect(text).toContain('Broadcast to 3 agents (id b1):')
    expect(text).toContain('grace: queued (busy: it gets this when its turn ends)')
    expect(text).toContain('tester: asleep (only the person can wake it)')
    expect(text).toContain('Replies arrive as messages')
    expect(parseBroadcastResult(text)?.rows.map((r) => [r.name, r.status])).toEqual([['linus', 'delivered'], ['grace', 'queued'], ['tester', 'asleep']])
  })
  it('says nothing about sleepers when everyone was told', () => {
    expect(formatBroadcastResult('b2', rows.slice(0, 1))).not.toContain('wake')
    expect(formatBroadcastResult('b2', rows.slice(0, 1))).toContain('Broadcast to 1 agent (id b2):')
  })
})
