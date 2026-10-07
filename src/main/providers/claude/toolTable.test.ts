import { describe, expect, it } from 'vitest'
import { claudeCalls } from './toolTable'

const t = (name: string, args: Record<string, unknown>) => claudeCalls.translate({ id: 'c1', name, args })

describe("Claude Code's scheduling tools in the chat's vocabulary", () => {
  it('a wake-up after a delay is a schedule in seconds, with what it will do', () => {
    expect(t('ScheduleWakeup', { delaySeconds: 1500, reason: 'Check CI', prompt: '/loop check CI' })).toEqual([{ id: 'c1', name: 'Schedule', input: { inSeconds: 1500, reason: 'Check CI', prompt: '/loop check CI' } }])
  })
  it('a wake-up that only passes the time says so, and a stop is a cancel', () => {
    expect(t('ScheduleWakeup', { delaySeconds: 300, noop: true, reason: 'Waiting', prompt: '<<autonomous-loop-dynamic>>' })[0]).toMatchObject({ name: 'Schedule', input: { noop: true } })
    expect(t('ScheduleWakeup', { stop: true })).toEqual([{ id: 'c1', name: 'Unschedule', input: {} }])
  })
  it('a cron job is a schedule with its expression, repeating unless it says it fires once', () => {
    expect(t('CronCreate', { cron: '0 9 * * 1-5', prompt: 'Summarise main' })).toEqual([{ id: 'c1', name: 'Schedule', input: { cron: '0 9 * * 1-5', repeat: true, reason: '', prompt: 'Summarise main' } }])
    expect(t('CronCreate', { cron: '30 14 28 2 *', prompt: 'x', recurring: false })[0]).toMatchObject({ input: { repeat: false } })
  })
  it('deleting a cron job is a cancel naming it', () => {
    expect(t('CronDelete', { id: 'job-1' })).toEqual([{ id: 'c1', name: 'Unschedule', input: { id: 'job-1' } }])
  })
  it('a monitor and every tool the chat already knows pass through as they are; odd arguments never throw', () => {
    expect(t('Monitor', { command: 'tail -f x', description: 'watch' })).toEqual([{ id: 'c1', name: 'Monitor', input: { command: 'tail -f x', description: 'watch' } }])
    expect(t('Bash', { command: 'ls' })).toEqual([{ id: 'c1', name: 'Bash', input: { command: 'ls' } }])
    expect(t('CronList', {})).toEqual([{ id: 'c1', name: 'CronList', input: {} }])
    expect(t('CronCreate', {})[0]).toMatchObject({ name: 'Schedule', input: { cron: '', prompt: '' } })
    expect(t('constructor', {})[0]).toMatchObject({ name: 'constructor' })
  })
})
