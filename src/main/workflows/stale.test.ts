import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFS } from '../prefs'
import { staleAgents } from './stale'

const prefs = (over: object = {}, defaults: Record<string, string> = {}) => ({ ...DEFAULT_PREFS.workflows, enabled: true, since: 1000, defaults, ...over })
const agent = (id: string, launchedAt: number, online = true) => ({ id, name: id, online, launchedAt })
const stale = (o: Partial<Parameters<typeof staleAgents>[0]>) => staleAgents({ agents: [agent('early', 500), agent('late', 2000)], project: '/p', workflows: prefs(), changedAt: 0, ...o }).map((a) => a.id)

describe('which running agents started before the workflow was set', () => {
  it('is the agents that launched before Workflows was switched on, and not those that launched after', () => {
    expect(stale({})).toEqual(['early'])
  })

  it('is the agents that launched before the project\'s workflow file last changed', () => {
    expect(stale({ changedAt: 3000 })).toEqual(['early', 'late'])
    expect(stale({ changedAt: 1500 })).toEqual(['early'])
  })

  it('compares whole milliseconds: an agent launched in the same millisecond as the change is not stale', () => {
    expect(stale({ agents: [agent('same', 2000)], changedAt: 2000.6 })).toEqual([])
    expect(stale({ agents: [agent('before', 1999)], changedAt: 2000.6 })).toEqual(['before'])
  })

  it('is nobody when Workflows is off, or the project uses no workflow', () => {
    expect(stale({ workflows: prefs({ enabled: false }) })).toEqual([])
    expect(stale({ workflows: prefs({}, { '/p': 'none' }) })).toEqual([])
  })

  it('leaves out an agent that is not running, or whose launch is not known: it takes the workflow when it starts', () => {
    expect(stale({ agents: [agent('asleep', 500, false), agent('unknown', 0)] })).toEqual([])
  })

  it('keeps each agent\'s name', () => {
    expect(staleAgents({ agents: [{ id: 'a1', name: 'ada', online: true, launchedAt: 1 }], project: '/p', workflows: prefs(), changedAt: 0 })).toEqual([{ id: 'a1', name: 'ada' }])
  })
})
