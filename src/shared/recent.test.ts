import { describe, expect, it } from 'vitest'
import { activityByProject, agentsByRecent, projectsByRecent } from './recent'

const ag = (name: string, activeAt?: number, group?: string) => ({ id: name, name, activeAt, group })

describe('agents, most recently active first', () => {
  it('puts the one that did something last at the top', () => {
    expect(agentsByRecent([ag('ada', 10), ag('bo', 30), ag('cy', 20)]).map((a) => a.name)).toEqual(['bo', 'cy', 'ada'])
  })

  it('keeps the current order for agents with the same time or none, after those that have one', () => {
    expect(agentsByRecent([ag('ada'), ag('bo', 5), ag('cy'), ag('di', 5)]).map((a) => a.name)).toEqual(['bo', 'di', 'ada', 'cy'])
  })

  it('keeps agents under their group, groups in their given order, most recent first inside each', () => {
    const list = [ag('ada', 10, 'backend'), ag('bo', 30, 'backend'), ag('cy', 99), ag('di', 20, 'docs')]
    expect(agentsByRecent(list).map((a) => a.name)).toEqual(['cy', 'bo', 'ada', 'di'])
  })

  it('does not change the list it is given', () => {
    const list = [ag('ada', 1), ag('bo', 2)]
    agentsByRecent(list)
    expect(list.map((a) => a.name)).toEqual(['ada', 'bo'])
  })
})

describe('projects, the one whose agents did something last first', () => {
  const p = (path: string) => ({ path })
  it('orders by the latest activity of a project\'s agents', () => {
    const items = [p('/a'), p('/b'), p('/c')]
    expect(projectsByRecent(items, { '/b': 50, '/c': 90 }).map((w) => w.path)).toEqual(['/c', '/b', '/a'])
  })

  it('keeps the given order for projects with no activity, after the active ones', () => {
    const items = [p('/a'), p('/b'), p('/c'), p('/d')]
    expect(projectsByRecent(items, { '/c': 1 }).map((w) => w.path)).toEqual(['/c', '/a', '/b', '/d'])
  })
})

describe('when each project last did something', () => {
  it('is the latest of its agents, and 0 for one whose agents have no time', () => {
    expect(activityByProject([{ repoPath: '/a', activeAt: 5 }, { repoPath: '/a', activeAt: 9 }, { repoPath: '/b' }, { repoPath: '/a' }])).toEqual({ '/a': 9, '/b': 0 })
  })

  it('is empty for no agents', () => {
    expect(activityByProject([])).toEqual({})
  })
})
