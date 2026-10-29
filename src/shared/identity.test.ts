import { describe, expect, it } from 'vitest'
import { billboardLine, pickProfile, profileFor, profileUse, removeProfile, saveProfile, type Identity } from './identity'

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

describe('billboardLine', () => {
  const logins = [{ login: 'pratikGhodke1', active: true }]
  it('says who the project acts as when the login is signed in', () => expect(billboardLine(work, logins)).toEqual({ text: 'as pratikghodke1', out: false }))
  it('says the login is out when gh does not hold it', () => expect(billboardLine(work, [])).toEqual({ text: 'pratikghodke1 out', out: true }))
  it('has no line without a profile, as before', () => expect(billboardLine(undefined, logins)).toBeNull())
  it('cuts a long login the way a long project name is cut', () => {
    const long = { ...work, login: 'a-very-long-login-name-indeed' }
    const line = billboardLine(long, [{ login: long.login, active: false }])!
    expect(line.text).toHaveLength(22)
    expect(line.text.endsWith('.')).toBe(true)
  })
})

describe('profileFor', () => {
  const id: Identity = { profiles: [work], byProject: { '/a': 'work' } }
  it('finds the profile picked for a project', () => expect(profileFor(id, '/a')).toEqual(work))
  it('is undefined for a project with none, so the machine settings are used', () => expect(profileFor(id, '/other')).toBeUndefined())
  it('covers a folder inside the project, such as an agent worktree or a repo in a multi-repo folder', () => expect(profileFor(id, '/a/sub/repo')).toEqual(work))
  it('does not mistake a sibling that shares a name prefix', () => expect(profileFor(id, '/a-other')).toBeUndefined())
  it('prefers the deepest project that holds the folder', () => {
    const b = { ...work, id: 'b' }
    expect(profileFor({ profiles: [work, b], byProject: { '/a': 'work', '/a/b': 'b' } }, '/a/b/c')).toEqual(b)
  })
})
