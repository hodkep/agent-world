import { describe, expect, it } from 'vitest'
import { cronWords, inWords, jobId, monitorTask, monitorView, nextCron, scheduleView } from './watch'

// Local times, so the tests do not depend on where they run.
const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime()
const T0 = at(2026, 10, 7, 19, 11) // Wednesday 7 October 2026, 19:11

describe('a cron expression in words', () => {
  it('says the common ones plainly', () => {
    expect(cronWords('*/5 * * * *', true)).toBe('every 5 minutes')
    expect(cronWords('7 * * * *', true)).toBe('every hour at :07')
    expect(cronWords('57 8 * * *', true)).toBe('every day at 08:57')
    expect(cronWords('0 9 * * 1-5', true)).toBe('every weekday at 09:00')
    expect(cronWords('30 14 * * 4', true)).toBe('every Thursday at 14:30')
  })
  it('says a one-off by its date, and keeps any other as it is written', () => {
    expect(cronWords('30 14 28 2 *', false)).toBe('once, 28 Feb at 14:30')
    expect(cronWords('0 9,17 * * *', true)).toBe('cron 0 9,17 * * *')
    expect(cronWords('', true)).toBe('')
  })
})

describe('when a cron expression fires next', () => {
  it('finds the next match after a time, with lists, ranges and steps', () => {
    expect(nextCron('*/15 * * * *', T0)).toBe(at(2026, 10, 7, 19, 15))
    expect(nextCron('0 9 * * 1-5', T0)).toBe(at(2026, 10, 8, 9, 0))
    expect(nextCron('0 9 * * 1-5', at(2026, 10, 9, 10, 0))).toBe(at(2026, 10, 12, 9, 0))
    expect(nextCron('0 9,17 * * *', T0)).toBe(at(2026, 10, 8, 9, 0))
    expect(nextCron('0 9,17 * * *', at(2026, 10, 7, 10, 0))).toBe(at(2026, 10, 7, 17, 0))
  })
  it('gives nothing for an expression it cannot read', () => {
    expect(nextCron('every day', T0)).toBeNull()
    expect(nextCron('61 * * * *', T0)).toBeNull()
  })
})

describe('a length of time in words', () => {
  it('uses the biggest units that read well', () => {
    expect(inWords(24 * 60_000)).toBe('24 min')
    expect(inWords(13 * 3600_000 + 20 * 60_000)).toBe('13 h 20 m')
    expect(inWords(40_000)).toBe('40 s')
    expect(inWords(0)).toBe('now')
  })
})

describe('a monitor', () => {
  const started = 'Monitor started (task bnfx5vv1z, expires in 4m unless the source ends first; you get one notice at expiry). You will be notified on each event.'
  it('has a task id and a lifetime in what it was answered with', () => {
    expect(monitorTask(started)).toEqual({ id: 'bnfx5vv1z', ms: 240_000 })
    expect(monitorTask('Monitor started (task bmefz65ul, timeout 3600000ms). You will be notified')).toEqual({ id: 'bmefz65ul', ms: 3_600_000 })
    expect(monitorTask('something else')).toEqual({ id: '', ms: 0 })
  })
  it('is watching until its time is up, fires, ends, or did not start', () => {
    const run = { input: { timeout_ms: 240000 }, at: T0, result: { text: started, isError: false } }
    expect(monitorView(run, T0 + 43_000)).toMatchObject({ state: 'watching', remainingMs: 197_000, fill: expect.closeTo(43 / 240, 3) })
    expect(monitorView({ ...run, firings: [{ at: T0 + 9_000, text: 'x' }] }, T0 + 60_000)).toMatchObject({ state: 'fired' })
    expect(monitorView(run, T0 + 241_000)).toMatchObject({ state: 'expired', remainingMs: 0 })
    expect(monitorView({ ...run, ended: T0 + 35_000 }, T0 + 60_000)).toMatchObject({ state: 'ended' })
    expect(monitorView({ ...run, result: { text: 'refused', isError: true } }, T0)).toMatchObject({ state: 'failed' })
    expect(monitorView({ input: {}, at: T0 }, T0)).toMatchObject({ state: 'starting' })
  })
})

describe('a scheduled task', () => {
  it('a wake-up after a delay is waiting, then has run', () => {
    const run = { input: { inSeconds: 1500, reason: 'Check CI', prompt: '/loop check CI' }, at: T0, result: { text: JSON.stringify({ scheduledFor: T0 + 1_500_000 }), isError: false } }
    expect(scheduleView(run, T0 + 60_000)).toMatchObject({ state: 'waiting', when: 'Today at 19:36', left: '24 min' })
    expect(scheduleView(run, T0 + 1_600_000)).toMatchObject({ state: 'ran', when: 'Ran at 19:36', left: '' })
  })
  it('works out the time itself when the answer does not carry it', () => {
    expect(scheduleView({ input: { inSeconds: 600 }, at: T0 }, T0)).toMatchObject({ state: 'waiting', when: 'Today at 19:21' })
  })
  it('a repeating cron job shows its next time, and a cancelled one says it was cancelled', () => {
    const run = { input: { cron: '0 9 * * 1-5', repeat: true, prompt: 'x' }, at: T0 }
    expect(scheduleView(run, T0)).toMatchObject({ state: 'repeats', repeat: 'every weekday at 09:00', when: 'Next: Thu 09:00' })
    expect(scheduleView({ ...run, cancelled: true }, T0)).toMatchObject({ state: 'cancelled', when: 'Was: Thu 09:00' })
  })
  it('a one-off cron job is waiting until its time', () => {
    const run = { input: { cron: '30 20 7 10 *', repeat: false, prompt: 'x' }, at: T0 }
    expect(scheduleView(run, T0)).toMatchObject({ state: 'waiting', when: 'Today at 20:30' })
  })
  it('uses the reason as its title, and the start of the prompt when there is none', () => {
    expect(scheduleView({ input: { inSeconds: 60, reason: 'Check CI', prompt: 'long' }, at: T0 }, T0).title).toBe('Check CI')
    expect(scheduleView({ input: { cron: '0 9 * * *', reason: '', prompt: 'Summarise main overnight.\nThen flag anything.' }, at: T0 }, T0).title).toBe('Summarise main overnight.')
  })
})

describe('the id a schedule was given', () => {
  it('is read from JSON or from a line that says it', () => {
    expect(jobId(JSON.stringify({ id: 'cron-ab12cd' }))).toBe('cron-ab12cd')
    expect(jobId('Scheduled recurring job. Job ID: ab12cd34 (every weekday).')).toBe('ab12cd34')
    expect(jobId('job abc123 created')).toBe('abc123')
    expect(jobId('Scheduled.')).toBe('')
  })
})
