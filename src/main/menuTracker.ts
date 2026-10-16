/** A menu on an agent's terminal screen, as the chat is told of it. */
export interface ShownMenu {
  title: string
  context: string
  options: string[]
  hint: string
  cancellable?: boolean
  terminalOnly?: boolean
}

/**
 * Decides when a menu Claude draws in its terminal is offered to the chat: after it has stayed put for a moment, once while it stays, taken
 * away once when it goes, and offered again when a button was pressed for it and the same menu is still there (a card that was cancelled to no effect).
 */
export function createMenuTracker(o: { stableMs: number; now: () => number }) {
  const seen = new Map<string, { sig: string; since: number }>()
  const sent = new Map<string, string>()
  // Whether a card is out in the chat for this agent, whatever the last key pressed did to what is remembered of it.
  const out = new Set<string>()
  return {
    update(id: string, menu: ShownMenu | null, covered: boolean): { send: ShownMenu } | { clear: true } | null {
      const sig = menu && !covered ? JSON.stringify([menu.title, menu.context, menu.options]) : ''
      if (!sig) {
        seen.delete(id)
        sent.set(id, '')
        return out.delete(id) ? { clear: true } : null
      }
      const was = seen.get(id)
      if (was?.sig !== sig) {
        seen.set(id, { sig, since: o.now() })
        return null
      }
      if (o.now() - was.since >= o.stableMs && sent.get(id) !== sig) {
        sent.set(id, sig)
        out.add(id)
        return { send: menu! }
      }
      return null
    },
    /** A key was pressed for this agent's menu: if the same one is still on the screen after a moment, it is offered again. */
    pressed(id: string) {
      sent.set(id, '')
      seen.delete(id)
    },
    forgetAll() {
      seen.clear()
      sent.clear()
      out.clear()
    }
  }
}
