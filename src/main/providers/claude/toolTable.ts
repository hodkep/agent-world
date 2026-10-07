import { type Mapper, call, tableTranslator, text } from '../../../shared/tools'

const seconds = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/**
 * Claude Code's tools whose names or arguments are its own, in the chat's vocabulary. Everything it calls that the chat already
 * knows (Bash, Read, Monitor…) is passed on as it is. To teach the chat another Claude tool, add its line here.
 */
const table: Record<string, Mapper> = {
  ScheduleWakeup: (a) => (a.stop === true ? call.unschedule() : call.schedule({ inSeconds: seconds(a.delaySeconds) }, text(a.reason), text(a.prompt), { noop: a.noop === true })),
  CronCreate: (a) => call.schedule({ cron: text(a.cron), repeat: a.recurring !== false }, '', text(a.prompt)),
  CronDelete: (a) => call.unschedule(text(a.id))
}

export const claudeCalls = tableTranslator(table)
