// A once-a-second tick for on-screen elapsed clocks. It rests while the window is hidden or another app is in front,
// so the page is not woken every second for numbers nobody can see, and ticks once on return so they are right at once.
const browser = {
  away: () => document.hidden || !document.hasFocus(),
  onReturn(cb: () => void) {
    document.addEventListener('visibilitychange', cb)
    window.addEventListener('focus', cb)
    return () => (document.removeEventListener('visibilitychange', cb), window.removeEventListener('focus', cb))
  }
}

export function startClock(tick: () => void, env = browser): () => void {
  const t = setInterval(() => env.away() || tick(), 1000)
  const off = env.onReturn(() => env.away() || tick())
  return () => (clearInterval(t), off())
}
