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

  it('a quiet, idle-looking screen releases mail even if the end-of-turn hook never came (e.g. Esc)', () => {
    box.busy('a2')
    box.send('a1', 'linus', 'still waiting?')
    expect(delivered).toEqual([])
    box.looksIdle('a2')
    expect(delivered.map((d) => d.to)).toEqual(['a2'])
  })

  it('looking idle does nothing when there is no mail, or while still starting', () => {
    box.looksIdle('a2')
    online.add('a3')
    box.send('a1', 'grace', 'hi')
    box.looksIdle('a3')
    expect(delivered).toEqual([])
  })

  it('the office itself can message an agent: typed in at once when it is idle, held until its turn ends when busy, and no reply is asked for', () => {
    box.fromOffice('a1', 'Your plan was approved.')
    expect(delivered).toEqual([{ to: 'a1', text: '[Agent World] Your plan was approved.' }])
    box.busy('a2')
    box.fromOffice('a2', 'Revise it.')
    expect(delivered).toHaveLength(1)
    box.turnEnded('a2')
    expect(delivered[1]).toEqual({ to: 'a2', text: '[Agent World] Revise it.' })
  })

  it('office messages go first, and are dropped with the agent', () => {
    box.busy('a2')
    box.send('a1', 'linus', 'ping')
    box.fromOffice('a2', 'Approved.')
    box.turnEnded('a2')
    expect(delivered[0]!.text).toBe('[Agent World] Approved.')
    box.busy('a2')
    box.fromOffice('a2', 'Later.')
    box.gone('a2')
    box.turnEnded('a2')
    expect(delivered.some((d) => d.text.includes('Later'))).toBe(false)
  })

  it('the person\'s own words, sent for them, arrive exactly as written: held while the agent starts, first in line, and cleaned of keystrokes', () => {
    online.add('a4')
    box.fromPerson('a4', 'Every change to billing needs a review.\x1b[201~\r')
    expect(delivered.filter((d) => d.to === 'a4')).toEqual([])
    box.fromOffice('a4', 'Something else.')
    box.started('a4')
    expect(delivered.filter((d) => d.to === 'a4')).toEqual([{ to: 'a4', text: 'Every change to billing needs a review. ' }])
    box.turnEnded('a4')
    expect(delivered.filter((d) => d.to === 'a4')[1]).toEqual({ to: 'a4', text: '[Agent World] Something else.' })
  })

  it('the person\'s sent words are dropped with the agent', () => {
    box.busy('a2')
    box.fromPerson('a2', 'never')
    box.gone('a2')
    box.turnEnded('a2')
    expect(delivered.some((d) => d.text === 'never')).toBe(false)
  })

  describe('the same name in two projects', () => {
    beforeEach(() => {
      online = new Set(['a1', 'a2', 'b1', 'b2'])
      const all = () => [
        { id: 'a1', name: 'ada', online: true, repoPath: '/shop' },
        { id: 'a2', name: 'linus', online: true, repoPath: '/shop' },
        { id: 'b1', name: 'ada', online: true, repoPath: '/blog' },
        { id: 'b2', name: 'grace', online: true, repoPath: '/blog' },
        { id: 'c1', name: 'zed', online: true, repoPath: '/docs' }
      ]
      box = new Mailbox({ agents: all, deliver: (to, text) => delivered.push({ to, text }), notify: (m) => notes.push({ ...m }) })
      for (const id of ['a1', 'a2', 'b1', 'b2', 'c1']) box.ready(id)
    })

    it('reaches the one in the sender\'s own project', () => {
      box.send('a2', 'ada', 'hello')
      expect(delivered.at(-1)!.to).toBe('a1')
      box.send('b2', 'ada', 'hello')
      expect(delivered.at(-1)!.to).toBe('b1')
    })

    it('reaches a name that only one project has, from another project', () => {
      box.send('a2', 'grace', 'hi')
      expect(delivered.at(-1)!.to).toBe('b2')
    })

    it('asks the sender to say which, when the name is in two other projects', () => {
      expect(() => box.send('c1', 'ada', 'hi')).toThrow(/more than one agent named ada/i)
    })
  })

  it('knows an agent is starting until its input box is first seen, and again after a relaunch or when it is gone', () => {
    expect(box.isStarting('new')).toBe(true)
    box.started('new')
    expect(box.isStarting('new')).toBe(false)
    box.restarting('new')
    expect(box.isStarting('new')).toBe(true)
    box.ready('new')
    expect(box.isStarting('new')).toBe(false)
    box.gone('new')
    expect(box.isStarting('new')).toBe(true)
  })
})

describe('broadcast: one message to every other agent in the sender\'s project', () => {
  const crew = (online: string[]) => [
    { id: 'a1', name: 'ada', online: online.includes('a1'), repoPath: '/shop' },
    { id: 'a2', name: 'linus', online: online.includes('a2'), repoPath: '/shop' },
    { id: 'a3', name: 'grace', online: online.includes('a3'), repoPath: '/shop' },
    { id: 'a4', name: 'tester', online: online.includes('a4'), repoPath: '/shop' },
    { id: 'z9', name: 'other', online: true, repoPath: '/elsewhere' }
  ]
  const make = (on: string[], now = () => 0) => {
    const sent: { to: string; text: string }[] = []
    const seen: AgentMessage[] = []
    const b = new Mailbox({ agents: () => crew(on), deliver: (to, text) => sent.push({ to, text }), notify: (m) => seen.push({ ...m }), now })
    for (const id of on) b.ready(id)
    return { b, sent, seen }
  }

  it('tells each of the others at once, never the sender and never another project, and names who else was told', () => {
    const { b, sent } = make(['a1', 'a2', 'a3', 'a4', 'z9'])
    const r = b.broadcast('a1', 'main moved: rebase please', {})
    expect(r.results.map((x) => [x.name, x.status])).toEqual([['linus', 'delivered'], ['grace', 'delivered'], ['tester', 'delivered']])
    expect(sent.map((d) => d.to).sort()).toEqual(['a2', 'a3', 'a4'])
    const toLinus = sent.find((d) => d.to === 'a2')!.text
    expect(toLinus).toContain('Broadcast from ada (also sent to: grace, tester): main moved: rebase please')
    expect(toLinus).toContain('send_message')
    expect(toLinus).toContain('to="ada"')
  })

  it('holds it for a busy agent, and marks a sleeping one asleep without sending it anything', () => {
    const { b, sent, seen } = make(['a1', 'a2', 'a3'])
    b.busy('a2')
    const r = b.broadcast('a1', 'hello', {})
    expect(r.results.map((x) => [x.name, x.status])).toEqual([['linus', 'queued'], ['grace', 'delivered'], ['tester', 'asleep']])
    expect(sent.map((d) => d.to)).toEqual(['a3'])
    expect(b.pending('a4')).toBe(0)
    expect(seen.find((m) => m.toId === 'a4')).toMatchObject({ status: 'asleep', broadcast: r.id })
    b.turnEnded('a2')
    expect(sent.map((d) => d.to)).toEqual(['a3', 'a2'])
  })

  it('ties every copy to one broadcast id, and the sleeping one is told only to the person', () => {
    const { b, seen } = make(['a1', 'a2'])
    const r = b.broadcast('a1', 'hello', {})
    expect(new Set(seen.map((m) => m.broadcast))).toEqual(new Set([r.id]))
    expect(r.results.find((x) => x.status === 'asleep')?.reason).toContain('only the person can wake it')
  })

  it('leaves out an agent over the pair limit, with the reason, and still tells the others', () => {
    const { b } = make(['a1', 'a2', 'a3'])
    for (let i = 0; i < 6; i++) b.send('a1', 'linus', `m${i}`)
    const r = b.broadcast('a1', 'again', {})
    expect(r.results.find((x) => x.name === 'linus')).toMatchObject({ status: 'limit' })
    expect(r.results.find((x) => x.name === 'grace')?.status).toBe('delivered')
  })

  it('needs someone to tell, and a known sender', () => {
    const { b } = make(['a1'])
    expect(() => b.broadcast('nobody', 'hi', {})).toThrow('Unknown agent')
    const alone = new Mailbox({ agents: () => [{ id: 'a1', name: 'ada', online: true, repoPath: '/solo' }], deliver: () => undefined, notify: () => undefined })
    expect(() => alone.broadcast('a1', 'hi', {})).toThrow('no other agent')
  })
})
