import { useEffect, useState } from 'react'
import { startClock } from '../clock'

/** The time, kept up to date once a second while `on`, and not at all while off, nor while the window is hidden or another app is in front: what is not showing is not redrawn every second for a clock nobody sees. */
export function useClock(on: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!on) return
    setNow(Date.now())
    return startClock(() => setNow(Date.now()))
  }, [on])
  return now
}
