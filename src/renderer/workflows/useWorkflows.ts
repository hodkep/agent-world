import { useEffect, useState } from 'react'
import type { Run } from '../../shared/runs'
import type { RunSpend } from '../../shared/runStats'

/** The recorded runs and how many are still open, kept fresh as agents begin, finish and commit. */
export function useWorkflows() {
  const [s, setS] = useState<{ runs: Run[]; open: number; spend: Record<string, RunSpend> }>({ runs: [], open: 0, spend: {} })
  useEffect(() => {
    const load = () => void window.aw.workflows.summary().then(setS, () => undefined)
    load()
    return window.aw.onWorkflows(load)
  }, [])
  return s
}
