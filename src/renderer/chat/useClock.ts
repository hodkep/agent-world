import { useEffect, useState } from 'react'

/** The time, kept up to date once a second while `on`, and not at all while off: what is not showing is not redrawn every second for a clock nobody sees. */
export function useClock(on: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!on) return
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [on])
  return now
}
