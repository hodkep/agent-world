import type { ToolRun } from './ToolCard'
import { inWords, jobId, monitorView, scheduleView } from './watch'

/** One monitor or schedule that is still armed, as the list says it. */
export interface Armed {
  /** What the card is found by in the conversation. */
  key: string
  kind: 'monitor' | 'schedule'
  title: string
  detail: string
  when: string
  /** What to ask the agent, which is the only one that can cancel it. */
  stop: string
}

/** The monitors still watching and the schedules still waiting, from the calls in the conversation. */
export function armedOf(runs: ToolRun[], now: number): Armed[] {
  const out: Armed[] = []
  for (const run of runs) {
    if (run.name === 'Monitor') {
      const v = monitorView(run, now)
      if (v.state !== 'watching' && v.state !== 'fired') continue
      const last = run.firings?.at(-1)?.text.split('\n')[0] ?? ''
      const n = run.firings?.length ?? 0
      const title = String(run.input.description ?? '') || 'Watching a command'
      out.push({
        key: v.id || run.id || title,
        kind: 'monitor',
        title,
        detail: n ? `fired ${n}×${last ? ` · last: ${last}` : ''}` : 'nothing yet',
        when: `${inWords(v.remainingMs)} left`,
        stop: `Please stop the monitor ${v.id} (${title}) with the TaskStop tool, and leave everything else running.`
      })
    } else if (run.name === 'Schedule') {
      const v = scheduleView(run, now)
      if (v.state !== 'waiting' && v.state !== 'repeats') continue
      const id = jobId(run.result?.text ?? '')
      out.push({
        key: `sched:${run.id ?? ''}`,
        kind: 'schedule',
        title: v.title,
        detail: v.repeat || (run.input.noop === true ? 'a pause' : 'once'),
        when: v.state === 'repeats' ? v.when.replace(/^Next: /, '') : v.left ? `in ${v.left}` : v.when,
        stop: id ? `Please cancel the scheduled job ${id} (${v.title}) with CronDelete.` : `Please cancel the pending wake-up (${v.title}) by calling ScheduleWakeup with stop set to true.`
      })
    }
  }
  return out
}
