/** Where connecting a program to the message box is: its entry is written, then the program is asked what it lists, then it is ready. */
export type ConnectPhase = 'writing' | 'checking' | 'ready' | 'failed'
export type StepState = 'todo' | 'doing' | 'done' | 'failed'

/** How long a program that still does not list the entry is given after the re-scan came back, before it is called a failure. */
export const LATE_MS = 1200

export function connectStages(phase: ConnectPhase, label: string): { steps: { label: string; state: StepState }[]; percent: number; waiting: string } {
  const names = ['Writing the entry', `Checking ${label} sees it`, 'Ready']
  const states: Record<ConnectPhase, StepState[]> = {
    writing: ['doing', 'todo', 'todo'],
    checking: ['done', 'doing', 'todo'],
    ready: ['done', 'done', 'done'],
    failed: ['done', 'failed', 'todo']
  }
  const percent = { writing: 20, checking: 60, ready: 100, failed: 60 }[phase]
  const waiting = { writing: `Connecting ${label}…`, checking: `Checking ${label}…`, ready: '', failed: `Connect ${label} to continue.` }[phase]
  return { steps: names.map((n, i) => ({ label: n, state: states[phase][i]! })), percent, waiting }
}

/** The phase once the re-scan has been asked for: ready as soon as the program lists the entry; failed only when it still does not after `lateMs`. */
export function nextPhase(phase: ConnectPhase, seen: { scanned: boolean; mail: string; lateMs?: number }): ConnectPhase {
  if (phase === 'writing') return phase
  if (!seen.scanned) return phase
  if (seen.mail === 'connected') return 'ready'
  return (seen.lateMs ?? 0) >= LATE_MS ? 'failed' : phase
}
