/** The messages you sent, found in the conversation by what they are rather than by position, so folded or pending ones count too. */
export const USER_MSG = '[data-user-msg]'

export const userMessages = (log: Element) => [...log.querySelectorAll<HTMLElement>(USER_MSG)]

/** The message last jumped to, so the keyboard carries on from it. */
let last: HTMLElement | null = null
export const lastJump = (log: Element) => (last && last.isConnected && log.contains(last) ? last : null)

/** Scroll to one of your messages and flash it once so it can be found. */
export function show(el: HTMLElement) {
  last = el
  el.addEventListener('animationend', () => el.classList.remove('jumped'), { once: true })
  el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' })
  el.classList.remove('jumped')
  void el.offsetWidth
  el.classList.add('jumped')
}

/** Your message before (-1) or after (1) this one, or null at the ends. */
export function neighbour(log: Element, from: HTMLElement, dir: 1 | -1): HTMLElement | null {
  const all = userMessages(log)
  return all[all.indexOf(from) + dir] ?? null
}

/** Where a keyboard jump starts when nothing was jumped to yet: the message just above the middle of what is on screen, or just below it. */
export function fromView(log: HTMLElement, dir: 1 | -1): HTMLElement | null {
  const all = userMessages(log)
  const mid = log.getBoundingClientRect().top + log.clientHeight / 2
  const above = all.filter((m) => m.getBoundingClientRect().top < mid)
  return dir < 0 ? (above.at(-1) ?? all[0] ?? null) : (all[above.length] ?? null)
}

/** Where you are among your messages: 1-based place and how many. */
export function place(log: Element, el: HTMLElement) {
  const all = userMessages(log)
  return { at: all.indexOf(el) + 1, of: all.length }
}
