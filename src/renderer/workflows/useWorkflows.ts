import { useEffect, useRef, useState } from 'react'
import type { Run } from '../../shared/runs'
import type { RunSpend } from '../../shared/runStats'

/** The recorded runs and how many are still open, kept fresh as agents begin, finish and commit. */
export function useWorkflows() {
  const [s, setS] = useState<{ runs: Run[]; open: number; spend: Record<string, RunSpend>; unapproved: string[] }>({ runs: [], open: 0, spend: {}, unapproved: [] })
  // What the last summary was: the main process answers nothing when it has not changed, so an event that changed no run does not redraw the whole app.
  const version = useRef<string | undefined>(undefined)
  useEffect(() => {
    const load = () =>
      void window.aw.workflows.summary(version.current).then((r) => {
        if (!r) return
        version.current = r.version
        setS(r)
      }, () => undefined)
    load()
    return window.aw.onWorkflows(load)
  }, [])
  return s
}
