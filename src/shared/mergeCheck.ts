import type { Finding } from './audit'

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
  /** Things that hold Land back until the person acts. */
  blocking: string[]
  /** Things to know that never hold it back. */
  notes: string[]
}

export type AuditState =
  | { state: 'off'; reason: 'economy' | 'provider' | 'no-plan' | 'workflow' }
  | { state: 'not-run' }
  | { state: 'running' }
  | { state: 'failed'; reason: string }
  | { state: 'done'; findings: (Finding & { seen: boolean })[]; files: number; lines: number; truncated: boolean; cost?: number; model?: string }
