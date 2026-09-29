import { beforeEach, describe, expect, it } from 'vitest'
import type { AgentMessage } from '../shared/types'
import { Mailbox } from './mailbox'

let delivered: { to: string; text: string }[]
let notes: AgentMessage[]
let online: Set<string>
let box: Mailbox

const agents = () => [
  { id: 'a1', name: 'ada', online: online.has('a1') },
  { id: 'a2', name: 'linus', online: online.has('a2') },
  { id: 'a3', name: 'grace', online: online.has('a3') }
]

beforeEach(() => {
  delivered = []
  notes = []
  online = new Set(['a1', 'a2'])
  box = new Mailbox({ agents, deliver: (to, text) => delivered.push({ to, text }), notify: (m) => notes.push({ ...m }) })
  box.ready('a1')
  box.ready('a2')
})

describe('mailbox', () => {
  it('types a message straight into an idle recipient, saying who it is from and how to reply', () => {
    expect(box.send('a1', 'linus', 'can you review auth.ts?')).toBe('delivered')
    expect(delivered).toHaveLength(1)
    expect(delivered[0]!.to).toBe('a2')
    expect(delivered[0]!.text).toContain('ada')
    expect(delivered[0]!.text).toContain('can you review auth.ts?')
    expect(delivered[0]!.text).toContain('send_message')
    expect(notes.at(-1)).toMatchObject({ fromId: 'a1', toId: 'a2', status: 'delivered' })
  })

  it('holds mail for a busy recipient and delivers it when its turn ends', () => {
    box.busy('a2')
    expect(box.send('a1', 'linus', 'ping')).toBe('queued')
    expect(delivered).toEqual([])
    expect(box.pending('a2')).toBe(1)
    box.turnEnded('a2')
    expect(delivered.map((d) => d.to)).toEqual(['a2'])
    expect(box.pending('a2')).toBe(0)
    expect(notes.at(-1)).toMatchObject({ status: 'delivered' })
  })

  it('delivers at most one message per turn, in order', () => {
    box.busy('a2')
    box.send('a1', 'linus', 'first')
    box.send('a1', 'linus', 'second')
    box.turnEnded('a2')
    expect(delivered).toHaveLength(1)
    expect(delivered[0]!.text).toContain('first')
    // the delivered message starts a new turn; the next one waits for that turn to end
    box.turnEnded('a2')
    expect(delivered[1]!.text).toContain('second')
  })

  it('an agent that has not finished starting up is treated as busy', () => {
    online.add('a3')
    expect(box.send('a1', 'grace', 'hi')).toBe('queued')
    box.ready('a3')
    expect(delivered.map((d) => d.to)).toEqual(['a3'])
  })

  it('matches names case-insensitively', () => {
    expect(box.send('a1', 'LINUS', 'x')).toBe('delivered')
  })

  it('refuses unknown, offline and self recipients with a reason the sender can act on', () => {
    expect(() => box.send('a1', 'bob', 'x')).toThrow(/no agent named bob/i)
    expect(() => box.send('a1', 'grace', 'x')).toThrow(/grace is not running/i)
    expect(() => box.send('a1', 'ada', 'x')).toThrow(/yourself/i)
    expect(delivered).toEqual([])
  })

  it('drops queued mail for an agent that goes away', () => {
    box.busy('a2')
    box.send('a1', 'linus', 'x')
    box.gone('a2')
    expect(box.pending('a2')).toBe(0)
    expect(notes.at(-1)).toMatchObject({ status: 'dropped' })
  })

  it('a started signal only wakes agents that are still starting, never a busy one', () => {
    online.add('a3')
    box.send('a1', 'grace', 'hi')
    box.started('a3')
    expect(delivered.map((d) => d.to)).toEqual(['a3'])
    box.busy('a2')
    box.send('a1', 'linus', 'later')
    box.started('a2')
    expect(delivered).toHaveLength(1)
  })

  it('a reply tells the recipient no answer is needed, so agents do not ping-pong', () => {
    box.send('a2', 'ada', 'done, REVIEW.md created', { expectsReply: false })
    expect(delivered[0]!.text).toContain('No reply is needed')
    expect(delivered[0]!.text).not.toContain('reply using')
  })

  it('a request asks for a reply marked as a reply', () => {
    box.send('a1', 'linus', 'please review')
    expect(delivered[0]!.text).toContain('expects_reply=false')
  })

  it('caps the back-and-forth between two agents and tells the sender to involve the user', () => {
    let now = 0
    box = new Mailbox({ agents, deliver: (to, text) => delivered.push({ to, text }), notify: () => {}, now: () => now })
    box.ready('a1')
    box.ready('a2')
    for (let i = 0; i < 6; i++) {
      box.send(i % 2 ? 'a2' : 'a1', i % 2 ? 'ada' : 'linus', `m${i}`)
      box.turnEnded('a1')
      box.turnEnded('a2')
    }
    expect(() => box.send('a1', 'linus', 'again')).toThrow(/limit.*ask the user/i)
    now += 11 * 60 * 1000
    expect(() => box.send('a1', 'linus', 'later')).not.toThrow()
  })

  it('strips terminal control sequences so a message cannot end the paste and type keystrokes', () => {
    box.send('a1', 'linus', 'hi\x1b[201~\r/exit\r\x1b[200~ and \x07bell\x1b[31mred')
    const text = delivered[0]!.text
    expect(text).not.toMatch(/\x1b|\x07|\r/)
    expect(text).toContain('hi')
    expect(text).toContain('/exit')
  })

  it('keeps newlines and tabs, which are safe inside a paste', () => {
    box.send('a1', 'linus', 'line one\n\tline two')
    expect(delivered[0]!.text).toContain('line one\n\tline two')
  })

  it('an agent restarting (to switch model) keeps its mail and gets it once its terminal is back', () => {
    box.restarting('a2')
    expect(box.send('a1', 'linus', 'after restart')).toBe('queued')
    box.started('a2')
    expect(delivered.map((d) => d.to)).toEqual(['a2'])
  })
})
