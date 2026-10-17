import { type JumpSettle, settleStep } from './jumpSettle'
import { jumpStart } from './jumpStart'

/** The messages you sent, found in the conversation by what they are rather than by position, so folded or pending ones count too. */
export const USER_MSG = '[data-user-msg]'

export const userMessages = (log: Element) => [...log.querySelectorAll<HTMLElement>(USER_MSG)]

/** The message last jumped to, so the keyboard carries on from it. */
let last: HTMLElement | null = null
export const lastJump = (log: Element) => (last && last.isConnected && log.contains(last) ? last : null)

/** Said on the conversation when a jump begins, so it stops following its end. */
export const JUMPED = 'aw-jumped'
/** Said on the conversation when the jump has settled. */
export const SETTLED = 'aw-jump-settled'

/** The jump that is still settling, so a newer one takes over from it. */
let settling: (() => void) | null = null

/**
 * Scroll to one of your messages, put it in the middle and flash it once so it can be found.
 * Replies that were not drawn yet are counted as a short placeholder and grow when they come into view, so a smooth scroll
 * aimed from the start ends up somewhere else: this jumps at once and puts the message back in the middle on every frame until things stop
 * moving (see settleStep), or until you take the scroll over yourself.
 */
export function show(el: HTMLElement) {
  last = el
  settling?.()
  const log = el.closest<HTMLElement>('.chat-log')
  /** Puts the message in the middle; says how far off it was. */
  const centre = () => {
    if (!log) return 0
    const r = el.getBoundingClientRect()
    const off = (r.top + r.bottom) / 2 - (log.getBoundingClientRect().top + log.clientHeight / 2)
    log.scrollTop += off
    return off
  }
  log?.dispatchEvent(new Event(JUMPED))
  const began = performance.now()
  let state: JumpSettle | null = null
  let frame = 0
  const stop = () => {
    cancelAnimationFrame(frame)
    log?.removeEventListener('wheel', stop)
    log?.removeEventListener('pointerdown', stop)
    if (settling === stop) settling = null
    log?.dispatchEvent(new Event(SETTLED))
  }
  settling = stop
  // Taking the scroll over by hand ends it, so it never fights the person.
  log?.addEventListener('wheel', stop, { once: true, passive: true })
  log?.addEventListener('pointerdown', stop, { once: true })
  const look = () => {
    const off = centre()
    const next = settleStep(state, { ms: performance.now() - began, height: log?.scrollHeight ?? 0, off })
    state = next.state
    if (next.done || !log) stop()
    else frame = requestAnimationFrame(look)
  }
  look()
  el.addEventListener('animationend', () => el.classList.remove('jumped'), { once: true })
  el.classList.remove('jumped')
  void el.offsetWidth
  el.classList.add('jumped')
}

/** Your message before (-1) or after (1) this one, or null at the ends. */
export function neighbour(log: Element, from: HTMLElement, dir: 1 | -1): HTMLElement | null {
  const all = userMessages(log)
  return all[all.indexOf(from) + dir] ?? null
}

/** Where a keyboard jump starts when nothing was jumped to yet (see jumpStart); `atEnd` is whether the conversation is following its end. */
export function fromView(log: HTMLElement, dir: 1 | -1, atEnd = false): HTMLElement | null {
  const all = userMessages(log)
  const mid = log.getBoundingClientRect().top + log.clientHeight / 2
  const at = jumpStart(all.map((m) => m.getBoundingClientRect().top), mid, dir, atEnd)
  return at === null ? null : (all[at] ?? null)
}

/** Where you are among your messages: 1-based place and how many. */
export function place(log: Element, el: HTMLElement) {
  const all = userMessages(log)
  return { at: all.indexOf(el) + 1, of: all.length }
}
