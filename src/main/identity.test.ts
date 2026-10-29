import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanIdentity, identityEnv, loadIdentity, profileFor, saveIdentity } from './identity'

const work = { id: 'work', name: 'Sarvaha work', login: 'pratikGhodke1', gitName: 'Pratik Ghodke', gitEmail: 'pratik.ghodke@sarvaha.com' }
const teamB = { ...work, id: 'team-b', name: 'Team B', gitEmail: 'pratik@teamb.sarvaha.com' }

describe('cleanIdentity', () => {
  it('keeps good profiles and the project each one is picked for', () => {
    const id = cleanIdentity({ profiles: [work, teamB], byProject: { '/a': 'work', '/b': 'team-b' } })
    expect(id.profiles).toEqual([work, teamB])
    expect(id.byProject).toEqual({ '/a': 'work', '/b': 'team-b' })
  })

  it('lets two profiles share one login with different emails', () => {
    const id = cleanIdentity({ profiles: [work, teamB], byProject: {} })
    expect(id.profiles.map((p) => p.login)).toEqual(['pratikGhodke1', 'pratikGhodke1'])
  })

  it('drops profiles that are unusable: no id, no login, a repeated id, an odd id or an email without @', () => {
    const id = cleanIdentity({
      profiles: [work, { ...work, id: '' }, { ...work, id: 'x', login: '' }, { ...work, id: 'work' }, { ...work, id: 'Bad Id' }, { ...work, id: 'y', gitEmail: 'nope' }, 7, null]
    })
    expect(id.profiles.map((p) => p.id)).toEqual(['work'])
  })

  it('forgets a project whose profile is gone', () => {
    expect(cleanIdentity({ profiles: [work], byProject: { '/a': 'work', '/b': 'deleted' } }).byProject).toEqual({ '/a': 'work' })
  })

  it('survives anything that is not an object', () => {
    for (const raw of [undefined, null, 'x', 3, [], { profiles: 'x', byProject: 4 }]) expect(cleanIdentity(raw)).toEqual({ profiles: [], byProject: {} })
  })
})

describe('profileFor', () => {
  const id = cleanIdentity({ profiles: [work], byProject: { '/a': 'work' } })
  it('finds the profile picked for a project', () => expect(profileFor(id, '/a')).toEqual(work))
  it('is undefined for a project with none, so the machine settings are used', () => expect(profileFor(id, '/other')).toBeUndefined())
})

describe('identityEnv', () => {
  it('sets the login token and both the author and the committer', () => {
    expect(identityEnv(work, 'gho_abc')).toEqual({
      GH_TOKEN: 'gho_abc',
      GITHUB_TOKEN: 'gho_abc',
      GIT_AUTHOR_NAME: 'Pratik Ghodke',
      GIT_AUTHOR_EMAIL: 'pratik.ghodke@sarvaha.com',
      GIT_COMMITTER_NAME: 'Pratik Ghodke',
      GIT_COMMITTER_EMAIL: 'pratik.ghodke@sarvaha.com'
    })
  })

  it('still sets who commits when the login is signed out, but sends no token', () => {
    const env = identityEnv(work, undefined)
    expect(env.GIT_AUTHOR_EMAIL).toBe('pratik.ghodke@sarvaha.com')
    expect(env).not.toHaveProperty('GH_TOKEN')
    expect(env).not.toHaveProperty('GITHUB_TOKEN')
  })

  it('adds nothing without a profile', () => expect(identityEnv(undefined, 'gho_abc')).toEqual({}))
})

describe('identity file', () => {
  let dir: string
  beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), 'aw-identity-'))))
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('saves and loads', () => {
    const file = join(dir, 'sub', 'identity.json')
    const id = cleanIdentity({ profiles: [work], byProject: { '/a': 'work' } })
    saveIdentity(file, id)
    expect(loadIdentity(file)).toEqual(id)
  })

  it('reads a missing or broken file as empty', () => {
    expect(loadIdentity(join(dir, 'none.json'))).toEqual({ profiles: [], byProject: {} })
    const bad = join(dir, 'bad.json')
    writeFileSync(bad, '{nope')
    expect(loadIdentity(bad)).toEqual({ profiles: [], byProject: {} })
  })
})
