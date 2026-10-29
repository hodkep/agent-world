import { describe, expect, it } from 'vitest'
import { pickProfile, profileUse, removeProfile, saveProfile, type Identity } from './identity'

const work = { id: 'work', name: 'Sarvaha work', login: 'pratikGhodke1', gitName: 'Pratik Ghodke', gitEmail: 'pratik.ghodke@sarvaha.com' }
const base: Identity = { profiles: [work], byProject: { '/a': 'work' } }

describe('pickProfile', () => {
  it('picks a profile for a project', () => expect(pickProfile(base, '/b', 'work').byProject).toEqual({ '/a': 'work', '/b': 'work' }))
  it('an empty pick goes back to the machine settings', () => expect(pickProfile(base, '/a', '').byProject).toEqual({}))
  it('does not change the list it was given', () => {
    pickProfile(base, '/b', 'work')
    expect(base.byProject).toEqual({ '/a': 'work' })
  })
})

describe('saveProfile', () => {
  it('adds a new profile with an id made from its name', () => {
    const next = saveProfile(base, { name: 'Team B', login: 'x', gitName: 'P', gitEmail: 'p@b.com' })
    expect(next.profiles.map((p) => p.id)).toEqual(['work', 'team-b'])
  })
  it('never reuses an id that is taken', () => {
    const once = saveProfile(base, { name: 'Sarvaha work', login: 'x', gitName: 'P', gitEmail: 'p@b.com' })
    expect(once.profiles.map((p) => p.id)).toEqual(['work', 'sarvaha-work'])
    const twice = saveProfile(once, { name: 'Sarvaha work', login: 'x', gitName: 'P', gitEmail: 'p@b.com' })
    expect(twice.profiles.map((p) => p.id)).toEqual(['work', 'sarvaha-work', 'sarvaha-work-2'])
  })
  it('changes a profile in place, so the projects that use it follow', () => {
    const next = saveProfile(base, { id: 'work', name: 'Sarvaha work', login: 'pratikGhodke1', gitName: 'Pratik Ghodke', gitEmail: 'new@sarvaha.com' })
    expect(next.profiles).toHaveLength(1)
    expect(next.profiles[0]!.gitEmail).toBe('new@sarvaha.com')
    expect(next.byProject).toEqual({ '/a': 'work' })
  })
})

describe('removeProfile', () => {
  it('drops the profile and the projects that used it', () => expect(removeProfile(base, 'work')).toEqual({ profiles: [], byProject: {} }))
})

describe('profileUse', () => {
  it('lists the projects that use a profile', () => expect(profileUse({ ...base, byProject: { '/a': 'work', '/b': 'work' } }, 'work')).toEqual(['/a', '/b']))
})
