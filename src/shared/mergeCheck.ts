import type { Finding } from './audit'
import type { StepStatus } from './steps'

/** What the person is shown before landing an agent's work: where its plan stands, what the audit found, and what holds Land back. */
export interface MergeCheck {
  run: { id: string; title: string }
  plan: 'approved' | 'released' | 'waiting' | 'changes' | 'none' | 'not-needed'
  /** The plan the person approved, for the block above the findings; null when no plan was handed in. */
  planned: { goal: string; outOfScope: string[] } | null
  /** Commits in the run, and how many of them were made outside the task. */
  commits: number
  flagged: number
  audit: AuditState
  /** One row per check step of the run's workflow, for the checklist. */
  checks: CheckRow[]
  /** Things that hold Land back until the person acts. */
  blocking: string[]
  /** Things to know that never hold it back. */
  notes: string[]
}

export type AuditState =
  | { state: 'off'; reason: 'economy' | 'no-model' | 'no-plan' | 'workflow' | 'gate' }
  | { state: 'not-run' }
  | { state: 'running' }
  | { state: 'failed'; reason: string }
  | { state: 'done'; findings: (Finding & { seen: boolean })[]; files: number; lines: number; truncated: boolean; cost?: number; tokens?: number; model?: string }

export interface CheckRow {
  id: string
  name: string
  run: string
  state: StepStatus
  /** How many times it failed since it was last asked for again. */
  tries?: number
  /** How long its latest run took, and the end of what it printed when that is worth showing. */
  ms?: number
  tail?: string
}
