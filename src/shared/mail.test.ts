import { describe, expect, it } from 'vitest'
import { formatDelivery } from '../main/mailbox'
import { parseAgentMail } from './mail'

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
