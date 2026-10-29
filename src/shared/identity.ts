/** A GitHub login plus the name and email on commits. Two profiles may share a login: one email per team. */
export interface Profile {
  id: string
  name: string
  login: string
  gitName: string
  gitEmail: string
}

/** The profiles, and the one picked for each project folder. A project with none uses the machine's own gh and git settings. */
export interface Identity {
  profiles: Profile[]
  byProject: Record<string, string>
}

/** What the Settings panes show: the saved identity and the logins gh holds on this machine (which one it has active). */
export interface IdentityState {
  identity: Identity
  logins: { login: string; active: boolean }[]
}

/** Picks a profile for a project; an empty id puts it back to the machine's own settings. */
export function pickProfile(id: Identity, project: string, profileId: string): Identity {
  const { [project]: _, ...rest } = id.byProject
  return { ...id, byProject: profileId ? { ...rest, [project]: profileId } : rest }
}

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'profile'

/** Adds a profile (its id made from its name, never one taken) or, given an id, changes that one in place so the projects using it follow. */
export function saveProfile(id: Identity, p: Omit<Profile, 'id'> & { id?: string }): Identity {
  if (p.id && id.profiles.some((x) => x.id === p.id)) return { ...id, profiles: id.profiles.map((x) => (x.id === p.id ? { ...p, id: x.id } : x)) }
  const base = slug(p.name)
  let next = base
  for (let n = 2; id.profiles.some((x) => x.id === next); n++) next = `${base}-${n}`
  return { ...id, profiles: [...id.profiles, { ...p, id: next }] }
}

export const removeProfile = (id: Identity, profileId: string): Identity => ({
  profiles: id.profiles.filter((p) => p.id !== profileId),
  byProject: Object.fromEntries(Object.entries(id.byProject).filter(([, v]) => v !== profileId))
})

export const profileUse = (id: Identity, profileId: string): string[] => Object.keys(id.byProject).filter((p) => id.byProject[p] === profileId)
