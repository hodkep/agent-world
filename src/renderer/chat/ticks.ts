import { useSyncExternalStore } from 'react'

// What happens in a chat, as counts: the message box was changed, a message was sent. A widget is told the counts and nothing of what was typed or sent.
export interface Ticks {
  typing: number
  sent: number
}
const zero: Ticks = { typing: 0, sent: 0 }
const by = new Map<string, Ticks>()
const listeners = new Set<() => void>()
const bump = (id: string, k: keyof Ticks) => {
  const t = by.get(id) ?? zero
  by.set(id, { ...t, [k]: t[k] + 1 })
  listeners.forEach((l) => l())
}

export const noteKey = (agentId: string) => bump(agentId, 'typing')
export const noteSent = (agentId: string) => bump(agentId, 'sent')
export const tickCount = (agentId: string): Ticks => by.get(agentId) ?? zero
export const useTicks = (agentId: string): Ticks =>
  useSyncExternalStore(
    (cb) => (listeners.add(cb), () => void listeners.delete(cb)),
    () => tickCount(agentId)
  )
