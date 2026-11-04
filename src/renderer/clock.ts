// A once-a-second tick (or every `ms`) for on-screen elapsed clocks and polls. It rests while the window is hidden or another app is in front,
// so the page is not woken every second for numbers nobody can see, and ticks once on return so they are right at once.
const browser = {
  away: () => document.hidden || !document.hasFocus(),
  onReturn(cb: () => void) {
    document.addEventListener('visibilitychange', cb)
    window.addEventListener('focus', cb)
    return () => (document.removeEventListener('visibilitychange', cb), window.removeEventListener('focus', cb))
  }
}

/** For what is still read while the window is behind another app (a card, a list of commands): it rests only when the window is hidden or minimised. */
export const whileShown = {
  away: () => document.hidden,
  onReturn(cb: () => void) {
    document.addEventListener('visibilitychange', cb)
    return () => document.removeEventListener('visibilitychange', cb)
  }
}

export function startClock(tick: () => void, env = browser, ms = 1000): () => void {
  const t = setInterval(() => env.away() || tick(), ms)
  const off = env.onReturn(() => env.away() || tick())
  return () => (clearInterval(t), off())
}
