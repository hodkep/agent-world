import { describe, expect, it } from 'vitest'
import type { LimitWindow } from './types'
import { pickRunner, routeSpawn, runnerText, type CatalogModel, type Office } from './runnerPick'

const haiku: CatalogModel = { model: 'claude-haiku-5-5', program: 'claude', cost: 0.05, score: 0.704, n: 2 }
const sonnet: CatalogModel = { model: 'claude-sonnet-5-5', program: 'claude', cost: 0.88, score: 0.979, n: 2 }
const opus: CatalogModel = { model: 'claude-opus-5-5', program: 'claude', cost: 1.76, score: 0.964, n: 3 }
const flash: CatalogModel = { model: 'gemini-3.8-flash-low', program: 'agy', cost: 0.36, score: 0.608, n: 2 }
const catalog = [{ ...haiku, alias: 'haiku' }, { ...sonnet, alias: 'sonnet' }, opus, flash]
const office: Office = { idle: [], windows: [], now: Date.UTC(2026, 9, 29) }

describe('pickRunner: which model, which checks', () => {
  it('sends clear small work to the cheapest model that clears its tier, checked by its own tests', () => {
    expect(pickRunner({ kind: 'edit' }, catalog, office)).toMatchObject({ use: 'spawn', model: 'claude-haiku-5-5', checks: ['selftest'] })
  })
  it('asks no check of read-only work', () => {
    expect(pickRunner({ kind: 'read' }, catalog, office)).toMatchObject({ use: 'spawn', model: 'claude-haiku-5-5', checks: [] })
  })
  it('asks no tests of work that writes no code: reading and reviewing', () => {
    expect(pickRunner({ kind: 'review', vague: true }, catalog, office)).toMatchObject({ checks: [] })
  })
  it('adds a review when the spec is vague', () => {
    expect(pickRunner({ kind: 'edit', vague: true }, catalog, office)).toMatchObject({ checks: ['selftest', 'review'] })
  })
  it('lets Haiku take a clear feature but not a vague one', () => {
    expect(pickRunner({ kind: 'feature' }, catalog, office)).toMatchObject({ model: 'claude-haiku-5-5' })
    expect(pickRunner({ kind: 'feature', vague: true }, catalog, office)).toMatchObject({ model: 'claude-sonnet-5-5' })
  })
  it('needs three benchmarks behind a model before it reviews or plans', () => {
    expect(pickRunner({ kind: 'debug' }, catalog, office)).toMatchObject({ model: 'claude-sonnet-5-5' })
    expect(pickRunner({ kind: 'review' }, catalog, office)).toMatchObject({ model: 'claude-opus-5-5' })
  })
  it('names the cheapest stronger model to escalate to, and none when nothing is stronger', () => {
    expect(pickRunner({ kind: 'edit' }, catalog, office)).toMatchObject({ escalateTo: 'claude-sonnet-5-5' })
    expect(pickRunner({ kind: 'debug' }, catalog, office)).not.toHaveProperty('escalateTo')
  })
  it('never picks a model with no score, however cheap', () => {
    const fresh: CatalogModel = { model: 'brand-new', program: 'claude', cost: 0.001 }
    expect(pickRunner({ kind: 'edit' }, [fresh, ...catalog], office)).toMatchObject({ model: 'claude-haiku-5-5' })
    expect(pickRunner({ kind: 'edit' }, [fresh], office)).toEqual({ use: 'none', why: 'no model clears this kind of work' })
  })
})

const win = (provider: LimitWindow['provider'], remainingPct: number, kind: LimitWindow['kind'] = 'five_hour'): LimitWindow => ({ provider, group: provider, kind, remainingPct, resetsAt: '2026-10-30T00:00:00.000Z' })
const day = 86_400_000

describe('pickRunner: limits and retirement', () => {
  it('among models within twice the cheapest price, takes the program with more headroom', () => {
    const cheapFlash = { ...flash, cost: 0.08 }
    expect(pickRunner({ kind: 'edit' }, [haiku, { ...cheapFlash, score: 0.75 }], { ...office, windows: [win('claude', 40), win('agy', 90)] })).toMatchObject({ model: 'gemini-3.8-flash-low', program: 'agy' })
    expect(pickRunner({ kind: 'edit' }, [haiku, { ...cheapFlash, score: 0.75 }], { ...office, windows: [win('claude', 90), win('agy', 40)] })).toMatchObject({ model: 'claude-haiku-5-5' })
  })
  it('does not trade a much cheaper model for headroom', () => {
    expect(pickRunner({ kind: 'edit' }, [haiku, { ...flash, score: 0.75 }], { ...office, windows: [win('claude', 12), win('agy', 100)] })).toMatchObject({ model: 'claude-haiku-5-5' })
  })
  it('counts the tighter of the five-hour and weekly windows', () => {
    const o = { ...office, windows: [win('claude', 90), win('claude', 5, 'weekly')] }
    expect(pickRunner({ kind: 'read' }, catalog, o)).toMatchObject({ model: 'gemini-3.8-flash-low' })
  })
  it('skips a program with under 10% left in a window, while another can do the work', () => {
    expect(pickRunner({ kind: 'read' }, catalog, { ...office, windows: [win('claude', 9)] })).toMatchObject({ model: 'gemini-3.8-flash-low' })
  })
  it('falls back to a nearly empty program rather than none, and says so when every program is empty', () => {
    expect(pickRunner({ kind: 'edit' }, catalog, { ...office, windows: [win('claude', 5)] })).toMatchObject({ model: 'claude-haiku-5-5' })
    expect(pickRunner({ kind: 'edit' }, catalog, { ...office, windows: [win('claude', 0)] })).toEqual({ use: 'none', why: 'no model has headroom' })
  })
  it('skips a model its program drops within a week', () => {
    const o = { ...office }
    expect(pickRunner({ kind: 'edit' }, [{ ...haiku, retiresOn: o.now + 3 * day }, sonnet], o)).toMatchObject({ model: 'claude-sonnet-5-5' })
    expect(pickRunner({ kind: 'edit' }, [{ ...haiku, retiresOn: o.now + 30 * day }, sonnet], o)).toMatchObject({ model: 'claude-haiku-5-5' })
  })
})

describe('pickRunner: a free hired agent first', () => {
  const idle = (name: string, model: string, ctx: number, warm = false) => ({ name, model, ctx, warm })
  const withIdle = (...a: ReturnType<typeof idle>[]) => ({ ...office, idle: a })
  it('hands the work to an idle agent on a model in the cheap band, with the same checks', () => {
    expect(pickRunner({ kind: 'edit', vague: true }, catalog, withIdle(idle('a1', 'claude-haiku-5-5', 20_000)))).toMatchObject({ use: 'idle', agent: 'a1', checks: ['selftest', 'review'], escalateTo: 'claude-sonnet-5-5' })
  })
  it('does not borrow an idle agent on a model well above the price band', () => {
    expect(pickRunner({ kind: 'edit' }, catalog, withIdle(idle('a1', 'claude-sonnet-5-5', 5_000)))).toMatchObject({ use: 'spawn', model: 'claude-haiku-5-5' })
  })
  it('does not borrow one whose context is big and cache cold, because the whole context would be written again at a premium', () => {
    expect(pickRunner({ kind: 'edit' }, catalog, withIdle(idle('a1', 'claude-haiku-5-5', 150_000)))).toMatchObject({ use: 'spawn' })
    expect(pickRunner({ kind: 'edit' }, catalog, withIdle(idle('a1', 'claude-haiku-5-5', 150_000, true)))).toMatchObject({ use: 'idle', agent: 'a1' })
  })
  it('takes the idle agent with the smallest context', () => {
    expect(pickRunner({ kind: 'edit' }, catalog, withIdle(idle('big', 'claude-haiku-5-5', 50_000), idle('small', 'claude-haiku-5-5', 10_000)))).toMatchObject({ agent: 'small' })
  })
  it('does not borrow an agent on a program with no headroom', () => {
    expect(pickRunner({ kind: 'edit' }, catalog, { ...withIdle(idle('a1', 'claude-haiku-5-5', 1_000)), windows: [win('claude', 0)] })).toEqual({ use: 'none', why: 'no model has headroom' })
  })
})

describe('pickRunner: names an agent was hired with', () => {
  it('knows a model by its alias too, since an agent is hired on "haiku"', () => {
    const cat = [{ ...haiku, alias: 'haiku' }, sonnet]
    expect(pickRunner({ kind: 'edit' }, cat, { ...office, idle: [{ name: 'a1', model: 'haiku', ctx: 1_000, warm: false }] })).toMatchObject({ use: 'idle', agent: 'a1', model: 'claude-haiku-5-5' })
  })
})

describe('runnerText', () => {
  it('says in a few lines who should do the work and how to check it', () => {
    const t = runnerText({ use: 'spawn', model: 'claude-haiku-5-5', program: 'claude', checks: ['selftest', 'review'], escalateTo: 'claude-sonnet-5-5' })
    expect(t).toContain('Start a claude-haiku-5-5 agent')
    expect(t).toContain('write its own tests from the spec first')
    expect(t).toContain('second claude-haiku-5-5 agent')
    expect(t).toContain('claude-sonnet-5-5')
  })
  it('names the idle agent to hand the work to, and says when nothing fits', () => {
    expect(runnerText({ use: 'idle', agent: 'Ada', model: 'claude-haiku-5-5', program: 'claude', checks: [] })).toContain('Send it to Ada')
    expect(runnerText({ use: 'none', why: 'no model has headroom' })).toBe('No runner picked: no model has headroom.')
  })
})

describe('routeSpawn: what a subagent is started on', () => {
  it('leaves the request alone unless the mode is automatic', () => {
    expect(routeSpawn('suggest', { provider: 'claude' }, catalog, office)).toEqual({ provider: 'claude' })
    expect(routeSpawn('off', {}, catalog, office)).toEqual({ provider: 'claude' })
  })
  it('keeps a model the caller named', () => {
    expect(routeSpawn('auto', { provider: 'claude', model: 'opus' }, catalog, office)).toEqual({ provider: 'claude', model: 'opus' })
  })
  it('picks the model by the kind of work, and starts it on the name its program knows it by', () => {
    expect(routeSpawn('auto', { kind: 'edit' }, catalog, office)).toMatchObject({ provider: 'claude', model: 'haiku' })
    expect(routeSpawn('auto', { kind: 'review' }, catalog, office)).toMatchObject({ provider: 'claude', model: 'claude-opus-5-5' })
    expect(routeSpawn('auto', {}, catalog, office)).toMatchObject({ model: 'haiku' })
  })
  it('stays within the program the caller named', () => {
    expect(routeSpawn('auto', { provider: 'agy', kind: 'read' }, catalog, office)).toMatchObject({ provider: 'agy', model: 'gemini-3.8-flash-low' })
    const none = routeSpawn('auto', { provider: 'agy', kind: 'review' }, catalog, office)
    expect(none).toMatchObject({ provider: 'agy', pick: { use: 'none' } })
    expect(none.model).toBeUndefined()
  })
  it('says which idle agent to use instead, when one is free', () => {
    const r = routeSpawn('auto', { kind: 'edit' }, catalog, { ...office, idle: [{ name: 'Ada', model: 'haiku', ctx: 1_000, warm: false }] })
    expect(r.idle).toBe('Ada')
  })
  it('falls back to the request as made when nothing can be picked, and says what it did', () => {
    const r = routeSpawn('auto', { kind: 'edit' }, [], office)
    expect(r).toMatchObject({ provider: 'claude' })
    expect(r.model).toBeUndefined()
  })
})
