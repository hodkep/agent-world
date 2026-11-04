import { describe, expect, it } from 'vitest'
import type { ChatItem } from '../shared/chat'
import type { AgentRecord } from '../shared/types'
import { type Chat, chatFollower } from './chatFollow'
import type { Following } from './providers/ports'

const item = (id: string): ChatItem => ({ id, kind: 'user', text: id, at: 0 }) as ChatItem
const agent = (id: string, sessionId = 's1') => ({ id, sessionId }) as AgentRecord

function setup() {
  const sent: unknown[][] = []
  const chats = new Map<string, Chat>()
  const tails: (Following & { started: number; stopped: number; emit: (items: ChatItem[], replace: boolean) => void; done: () => void; older: { items: ChatItem[]; replace: boolean }[]; more: boolean })[] = []
  const agents = new Map<string, AgentRecord>()
  const f = chatFollower({
    chats,
    follow: (a, onItems) => {
      let done!: () => void
      const t = {
        started: 0,
        stopped: 0,
        older: [] as { items: ChatItem[]; replace: boolean }[],
        more: false,
        ready: new Promise<void>((r) => (done = r)),
        done: () => done(),
        emit: onItems,
        start() {
          t.started++
        },
        stop() {
          t.stopped++
        },
        get hasEarlier() {
          return t.more
        },
        earlier: async () => t.older.shift() ?? { items: [], replace: false }
      }
      tails.push(t)
      return t
    },
    send: (...a) => void sent.push(a),
    byId: (id) => agents.get(id),
    max: 5,
    trim: (x) => x
  })
  const add = (a: AgentRecord) => (agents.set(a.id, a), a)
  return { f, chats, tails, sent, add }
}

describe('following chats only where they are looked at', () => {
  it('reads nothing for an agent that is only known about, and starts when the chat is first opened', async () => {
    const { f, tails, add } = setup()
    f.follow(add(agent('a')), false)
    f.follow(add(agent('b')), false)
    expect(tails.map((t) => t.started)).toEqual([0, 0])
    expect(f.visit('a')).toMatchObject({ sessionId: 's1', items: [], loading: true })
    f.visit('a')
    expect(tails.map((t) => t.started)).toEqual([1, 0])
  })

  it('starts at once for an agent that is working, and when a sleeping one is woken', () => {
    const { f, tails, add } = setup()
    const a = add(agent('a'))
    f.follow(a, false)
    f.follow(add(agent('w')), true)
    expect(tails.map((t) => t.started)).toEqual([0, 1])
    f.follow(a, true) // the wake path asks again for the same session
    expect(tails.map((t) => t.started)).toEqual([1, 1])
    f.follow(a, true)
    expect(tails[0]!.started).toBe(1)
  })

  it('tells the window once, when the first read is over, and not for each batch while it loads', async () => {
    const { f, tails, sent, add } = setup()
    f.follow(add(agent('a')), false)
    f.visit('a')
    tails[0]!.emit([item('1'), item('2')], true)
    expect(sent).toEqual([])
    tails[0]!.done()
    await tails[0]!.ready
    await Promise.resolve()
    expect(sent).toEqual([['chat-reset', 'a', 's1']])
    expect(f.visit('a')).toMatchObject({ loading: false, items: [{ id: '1' }, { id: '2' }] })
    tails[0]!.emit([item('3')], false)
    expect(sent.at(-1)).toEqual(['chat-items', 'a', 's1', [item('3')]])
  })

  it('keeps what was read for the next visit', async () => {
    const { f, tails, add } = setup()
    f.follow(add(agent('a')), false)
    f.visit('a')
    tails[0]!.emit([item('1')], true)
    tails[0]!.done()
    await tails[0]!.ready
    expect(f.visit('a').items).toHaveLength(1)
    expect(tails[0]!.started).toBe(1)
  })

  it('starts over for a different session, and stops the old one', () => {
    const { f, tails, sent, add } = setup()
    f.follow(add(agent('a')), true)
    f.follow(agent('a', 's2'), false)
    expect(tails[0]!.stopped).toBe(1)
    expect(sent).toContainEqual(['chat-reset', 'a', 's2'])
    expect(tails[1]!.started).toBe(0)
  })

  it('loads earlier messages in front, keeps them past the usual cap, and says when there are no more', async () => {
    const { f, tails, add } = setup()
    f.follow(add(agent('a')), false)
    f.visit('a')
    tails[0]!.emit([item('4'), item('5'), item('6')], true)
    tails[0]!.more = true
    tails[0]!.older.push({ items: [item('2'), item('3')], replace: false })
    expect(await f.earlier('a')).toMatchObject({ items: [{ id: '2' }, { id: '3' }], more: true })
    tails[0]!.more = false
    tails[0]!.emit([item('7'), item('8'), item('9')], false)
    expect(f.visit('a').items.map((i) => i.id)).toEqual(['2', '3', '4', '5', '6', '7', '8', '9'].slice(-(5 + 2)))
    expect(await f.earlier('a')).toEqual({ items: [], more: false })
  })

  it('sends a reset when a rewind changed the earlier part', async () => {
    const { f, tails, sent, add } = setup()
    f.follow(add(agent('a')), false)
    f.visit('a')
    tails[0]!.older.push({ items: [item('x'), item('y')], replace: true })
    expect(await f.earlier('a')).toMatchObject({ items: [] })
    expect(sent).toContainEqual(['chat-reset', 'a', 's1'])
    expect(f.visit('a').items.map((i) => i.id)).toEqual(['x', 'y'])
  })
})

describe('after /clear', () => {
  it('does not start reading the old conversation again when the chat is opened before the new session arrives', () => {
    const { f, tails, add } = setup()
    const timers: (() => void)[] = []
    f.follow(add(agent('a')), true)
    f.clearNow('a', (fn) => void timers.push(fn))
    f.visit('a')
    expect(tails[0]!.started).toBe(1)
    timers[0]!() // Claude never switched: the old conversation is picked up again
    expect(tails[0]!.started).toBe(2)
  })
})
