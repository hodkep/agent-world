import { describe, expect, it } from 'vitest'
import type { ToolRun } from './ToolCard'
import { armedOf } from './watching'

const at = (h: number, mi = 0) => new Date(2026, 9, 7, h, mi).getTime()
const T0 = at(19, 11)
const mon = (o: Partial<ToolRun> = {}): ToolRun => ({ name: 'Monitor', id: 'm1', input: { description: 'Wait for the backend', command: 'x', timeout_ms: 240000 }, at: T0, result: { text: 'Monitor started (task bnfx5vv1z, expires in 4m).', isError: false }, ...o })
const sch = (o: Partial<ToolRun> = {}): ToolRun => ({ name: 'Schedule', id: 's1', input: { inSeconds: 1500, reason: 'Check CI', prompt: 'p' }, at: T0, result: { text: JSON.stringify({ scheduledFor: T0 + 1_500_000 }), isError: false }, ...o })

describe('what is still armed', () => {
  it('lists a monitor that is still watching, with what it last said and how long is left', () => {
    const [m] = armedOf([mon({ firings: [{ at: T0 + 9000, text: 'waiting… (3 tries)\nmore' }] })], T0 + 60_000)
    expect(m).toMatchObject({ kind: 'monitor', key: 'bnfx5vv1z', title: 'Wait for the backend', detail: 'fired 1× · last: waiting… (3 tries)', when: '3 min left' })
    expect(m!.stop).toContain('bnfx5vv1z')
  })
  it('lists a schedule that is waiting or repeats, and says how to cancel it', () => {
    const [w, c] = armedOf([sch(), sch({ id: 's2', input: { cron: '0 9 * * 1-5', repeat: true, reason: 'Morning digest', prompt: 'p' }, result: { text: 'Job ID: ab12cd34', isError: false } })], T0)
    expect(w).toMatchObject({ kind: 'schedule', key: 'sched:s1', title: 'Check CI', detail: 'once', when: 'in 25 min' })
    expect(w!.stop).toContain('ScheduleWakeup')
    expect(c).toMatchObject({ key: 'sched:s2', detail: 'every weekday at 09:00' })
    expect(c!.stop).toContain('CronDelete')
    expect(c!.stop).toContain('ab12cd34')
  })
  it('leaves out what is over: ended, expired, failed, cancelled and run', () => {
    const over = [mon({ ended: T0 + 30_000 }), mon({ id: 'm2' }), mon({ id: 'm3', result: { text: 'no', isError: true } }), sch({ cancelled: true }), sch({ id: 's3' })]
    expect(armedOf(over, T0 + 1_600_000).map((a) => a.key)).toEqual([])
  })
  it('ignores every other kind of call', () => {
    expect(armedOf([{ name: 'Bash', input: { command: 'ls' } } as ToolRun], T0)).toEqual([])
  })
})
