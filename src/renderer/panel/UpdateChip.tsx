import { useEffect, useState } from 'react'
import type { InstallState } from '../../shared/updateInstall'

export type UpdateInfo = { state: 'off' | 'checking' | 'none' | 'available' | 'ready' | 'error'; detail?: string; latest?: string; url?: string; tag?: string; install?: InstallState }

// What the last look found, kept for the whole window so a screen opened after it (Settings) still knows.
let last: UpdateInfo = { state: 'off' }
const listeners = new Set<(s: UpdateInfo) => void>()
let started = false
const publish = (s: UpdateInfo) => {
  last = s
  listeners.forEach((l) => l(s))
}

/** What the app last found about a newer version: said by the app as it looks, and asked for once for a window that opened after it. */
export function useUpdateInfo(): UpdateInfo {
  const [info, setInfo] = useState(last)
  useEffect(() => {
    if (!started) {
      started = true
      void window.aw.updateState().then((s) => last.state === 'off' && publish(s), () => undefined)
      window.aw.onUpdateState(publish)
    }
    listeners.add(setInfo)
    setInfo(last)
    return () => void listeners.delete(setInfo)
  }, [])
  return info
}

/** The newest version that is out but that this build cannot install itself (an unsigned Mac build), and the page of its release. */
export function useNewerVersion(): { latest: string; url: string } | null {
  const s = useUpdateInfo()
  return s.state === 'available' && s.latest && s.url ? { latest: s.latest, url: s.url } : null
}

/** A brass chip in the top bar that opens the release page of a newer version; it is gone once the app is that version. */
export function UpdateChip() {
  const newer = useNewerVersion()
  if (!newer) return null
  const say = `Agent World ${newer.latest} is available`
  return (
    <button className="update-chip" aria-label={`${say}: open its page`} title={`${say}. Click to open its page.`} onClick={() => void window.aw.openExternal(newer.url).catch(() => undefined)}>
      ↑ {newer.latest}
    </button>
  )
}
