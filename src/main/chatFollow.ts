import type { ChatItem } from '../shared/chat'
import type { AgentRecord } from '../shared/types'
import type { Following } from './providers/ports'

/** One agent's conversation as the window sees it. `started`: its file is being followed; `loading`: the first read has not finished. */
export interface Chat {
  tail: Following
  sessionId: string
  items: ChatItem[]
  started: boolean
  loading: boolean
  /** After /clear: the old conversation is left alone until the new session arrives or the wait is over. */
  paused?: boolean
  /** How many items are kept: more once earlier messages were asked for. */
  cap: number
}

export interface ChatState {
  sessionId: string
  items: ChatItem[]
  loading: boolean
  /** Whether the file holds messages before the ones sent. */
  more: boolean
  /** The size of the conversation file, for a loader that says what it reads. */
  bytes: number
}

/**
 * Follows each agent's conversation file, but only where someone looks: an agent that is only known about reads nothing, so starting the app
 * does not read every transcript. The first look (or a program that starts, or wakes) starts it; its first read is the newest part of the file, in
 * turns of the event loop, and the window is told once when that is over. What was read stays for the next look. Earlier messages come on request.
 */
export function chatFollower(d: {
  chats: Map<string, Chat>
  follow: (a: AgentRecord, onItems: (items: ChatItem[], replace: boolean) => void) => Following
  send: (channel: string, ...args: unknown[]) => void
  byId: (id: string) => AgentRecord | undefined
  max: number
  trim: (items: ChatItem[]) => ChatItem[]
}) {
  const { chats } = d
  const begin = (chat: Chat, a: AgentRecord) => {
    if (chat.started || chat.paused) return
    chat.started = true
    chat.loading = !!chat.tail.ready
    chat.tail.start()
    void chat.tail.ready?.then(() => {
      if (chats.get(a.id) !== chat) return
      chat.loading = false
      d.send('chat-reset', a.id, a.sessionId)
    })
  }
  const more = (chat: Chat) => !!chat.tail.hasEarlier

  return {
    /** Knows the agent's conversation; reads it now only when `start` (a program that is running or has just been woken). */
    follow(a: AgentRecord, start: boolean) {
      const now = chats.get(a.id)
      if (now?.sessionId === a.sessionId) {
        if (start) begin(now, a)
        return
      }
      now?.tail.stop()
      const chat: Chat = { tail: null as unknown as Following, sessionId: a.sessionId, items: [], started: false, loading: false, cap: d.max }
      chat.tail = d.follow(a, (items, replace) => {
        chat.items = d.trim((replace ? items : [...chat.items, ...items]).slice(-chat.cap))
        if (chat.loading) return // the first read ends with one reset, whatever came in on the way
        // A replacement (after a rewind) is told to the window as a reset, so it reloads the whole conversation.
        if (replace) d.send('chat-reset', a.id, a.sessionId)
        else d.send('chat-items', a.id, a.sessionId, items)
      })
      chats.set(a.id, chat)
      // A different session (after /clear or a fork) is a different conversation: the view starts over.
      if (now) d.send('chat-reset', a.id, a.sessionId)
      if (start) begin(chat, a)
    },

    /** The chat was opened: it starts being read if it was not, and what is known so far is given back. */
    visit(id: string): ChatState {
      const chat = chats.get(id)
      const a = d.byId(id)
      if (chat && a) begin(chat, a)
      return { sessionId: chat?.sessionId ?? '', items: chat?.items ?? [], loading: chat?.loading ?? false, more: chat ? more(chat) : false, bytes: chat?.tail.bytes ?? 0 }
    },

    /** The next older part of the conversation, for the window to put in front of what it has. */
    async earlier(id: string): Promise<{ items: ChatItem[]; more: boolean }> {
      const chat = chats.get(id)
      if (!chat?.tail.earlier) return { items: [], more: false }
      const r = await chat.tail.earlier()
      if (chats.get(id) !== chat) return { items: [], more: false }
      if (r.replace) {
        chat.items = d.trim(r.items.slice(-chat.cap))
        d.send('chat-reset', id, chat.sessionId)
        return { items: [], more: more(chat) }
      }
      chat.cap += r.items.length
      chat.items = d.trim([...r.items, ...chat.items])
      return { items: chat.items.slice(0, r.items.length), more: more(chat) }
    },

    /**
     * /clear starts a new Claude session, but its id only reaches us with a later hook event, so the old conversation
     * would linger on screen. Empty the view at once and let the new session's tail take over when its id arrives.
     */
    clearNow(id: string, later: (fn: () => void, ms: number) => void = setTimeout) {
      const chat = chats.get(id)
      const a = d.byId(id)
      if (!chat || !a) return
      chat.items = []
      d.send('chat-reset', id, a.sessionId)
      chat.tail.stop()
      chat.started = false
      chat.paused = true
      // If Claude never switches (the command was refused), pick the old conversation back up.
      later(() => {
        chat.paused = false
        if (chats.get(id) === chat && a.sessionId === chat.sessionId) begin(chat, a)
      }, 60_000)
    }
  }
}
