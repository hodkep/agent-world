import { describe, expect, it } from 'vitest'
import type { UsageRecord } from '../shared/tokens'
import { requestEvents } from './usageLedger'

const who = { agent: 'a1', project: 'web', provider: 'claude', name: 'Ada' }
const rec = (id: string, o: Partial<UsageRecord> = {}): UsageRecord => ({ id, at: 1000, model: 'opus', input: 2, cacheRead: 80, cacheWrite: 5, output: 7, ...o })

describe('requests turned into ledger events', () => {
  it('gives one event per request, filed under the agent, its project, program and account', () => {
    const events = requestEvents([rec('r1')], { ...who, account: 'work' }, new Set())
    expect(events).toEqual([{ k: 'req', t: 1000, agent: 'a1', project: 'web', provider: 'claude', name: 'Ada', account: 'work', model: 'opus', input: 2, cacheRead: 80, cacheWrite: 5, output: 7 }])
  })

  it('leaves out a figure the program did not give, and has no account key for the program\'s own login', () => {
    const [e] = requestEvents([rec('r1', { cacheWrite: undefined })], who, new Set())
    expect('cacheWrite' in e!).toBe(false)
    expect('account' in e!).toBe(false)
  })

  it('counts a request once, however often it is reported', () => {
    const seen = new Set<string>()
    expect(requestEvents([rec('r1'), rec('r2')], who, seen)).toHaveLength(2)
    expect(requestEvents([rec('r2'), rec('r3')], who, seen).map((e) => (e.k === 'req' ? e.input : -1))).toHaveLength(1)
    expect(requestEvents([rec('r1')], who, seen)).toEqual([])
  })

  it('adds a dollar estimate, marked as one, for a program that reports no price', () => {
    const estimate = (model: string, input: number, output: number) => (model === 'opus' ? (input + output) / 1000 : null)
    const events = requestEvents([rec('r1')], who, new Set(), estimate)
    expect(events.map((e) => e.k)).toEqual(['req', 'cost'])
    // What it read counts the part from the cache, as before requests were counted exactly.
    expect(events[1]).toMatchObject({ k: 'cost', t: 1000, agent: 'a1', provider: 'claude', model: 'opus', usd: (2 + 80 + 7) / 1000, est: true })
  })

  it('adds no estimate when the model has no known price', () => {
    expect(requestEvents([rec('r1', { model: 'mystery' })], who, new Set(), () => null).map((e) => e.k)).toEqual(['req'])
  })

  it('forgets old ids before the list grows without end, and still stops an immediate repeat', () => {
    const seen = new Set<string>()
    requestEvents(Array.from({ length: 5000 }, (_, i) => rec(`r${i}`)), who, seen)
    expect(seen.size).toBeLessThan(5000)
    expect(requestEvents([rec('r4999')], who, seen)).toEqual([])
  })
})
