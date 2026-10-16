import { useEffect, useState } from 'react'
import type { LandingHold } from '../../shared/api'

/** The merges git held for want of the person's word, kept current as the office tells the window. */
export function useLandingHolds(): LandingHold[] {
  const [holds, setHolds] = useState<LandingHold[]>([])
  useEffect(() => {
    const load = () => void window.aw.landingHolds().then(setHolds, () => undefined)
    load()
    return window.aw.onLanding(load)
  }, [])
  return holds
}
