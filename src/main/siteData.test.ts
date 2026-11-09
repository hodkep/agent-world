import { describe, expect, it } from 'vitest'
import { clearAllSites, clearSite, keepSessionCookies, listSites, type SiteSession } from './siteData'

type Cookie = { domain: string; name: string; path: string; secure: boolean }
const c = (domain: string, name: string, secure = true): Cookie => ({ domain, name, path: '/', secure })

/** A session whose cookies really go when removed, so a test sees what is left, not which calls were made. */
function fake(jar: Cookie[]) {
  const calls = { origins: [] as string[], all: 0, cache: 0 }
  const ses: SiteSession = {
    cookies: {
      get: async () => [...jar],
      remove: async (url, name) => {
        const host = new URL(url).hostname
        const i = jar.findIndex((k) => k.name === name && k.domain.replace(/^\./, '') === host)
        if (i >= 0) jar.splice(i, 1)
      }
    },
    clearStorageData: async (o) => {
      if (o?.origin) calls.origins.push(o.origin)
      else (calls.all++, (jar.length = 0))
    },
    clearCache: async () => void calls.cache++
  }
  return { ses, jar, calls }
}

const JAR = () => [c('.github.com', 'a'), c('github.com', 'b'), c('gist.github.com', 'c'), c('.google.com', 'd'), c('accounts.google.com', 'e'), c('localhost', 'f', false)]

describe('listSites', () => {
  it('groups cookies by site, most first, with no leading dot', async () => {
    const { ses } = fake(JAR())
    const r = await listSites(ses)
    expect(r.others).toEqual([
      { host: 'github.com', cookies: 2 },
      { host: 'accounts.google.com', cookies: 1 },
      { host: 'gist.github.com', cookies: 1 },
      { host: 'google.com', cookies: 1 },
      { host: 'localhost', cookies: 1 }
    ])
    expect(r.current).toBeNull()
  })

  it('counts every cookie that reaches the page being shown, and leaves those out of the other sites', async () => {
    const { ses } = fake(JAR())
    const r = await listSites(ses, 'gist.github.com')
    expect(r.current).toEqual({ host: 'gist.github.com', cookies: 3 })
    expect(r.others.map((s) => s.host)).toEqual(['accounts.google.com', 'google.com', 'localhost'])
  })

  it('shows the page being shown even when it holds nothing, and keeps its port', async () => {
    const { ses } = fake([])
    expect((await listSites(ses, 'localhost:5173')).current).toEqual({ host: 'localhost:5173', cookies: 0 })
  })
})

describe('clearSite', () => {
  it('removes the cookies of that site and its subdomains, and no one else’s', async () => {
    const { ses, jar } = fake(JAR())
    await clearSite(ses, 'github.com')
    expect(jar.map((k) => k.name).sort()).toEqual(['d', 'e', 'f'])
  })

  it('clears the stored data of the site and of each subdomain that holds cookies, on both schemes', async () => {
    const { ses, calls } = fake(JAR())
    await clearSite(ses, 'github.com')
    expect(calls.origins.sort()).toEqual(['http://gist.github.com', 'http://github.com', 'https://gist.github.com', 'https://github.com'])
    expect(calls.all).toBe(0)
  })

  it('takes a port as part of the site: the stored data is that page’s, the cookies are the host’s', async () => {
    const { ses, jar, calls } = fake(JAR())
    await clearSite(ses, 'localhost:5173')
    expect(jar.map((k) => k.name)).not.toContain('f')
    expect(calls.origins).toContain('http://localhost:5173')
  })

  it('on a subdomain also removes the parent domain’s cookies that the page sees, so the page is logged out', async () => {
    const { ses, jar } = fake(JAR())
    await clearSite(ses, 'gist.github.com')
    expect(jar.map((k) => k.name).sort()).toEqual(['d', 'e', 'f'])
  })

  it('does not match a site by the end of its name', async () => {
    const { ses, jar } = fake([c('.notgithub.com', 'x')])
    await clearSite(ses, 'github.com')
    expect(jar).toHaveLength(1)
  })

  it.each(['', ' ', 'a b', 'https://github.com', 'github.com/x', '*', 'github.com:99999x', '..'])('refuses %j and touches nothing', async (bad) => {
    const { ses, jar, calls } = fake(JAR())
    await expect(clearSite(ses, bad)).rejects.toThrow(/site/i)
    expect(jar).toHaveLength(6)
    expect(calls.origins).toEqual([])
  })
})

describe('clearAllSites', () => {
  it('empties everything, the cache included', async () => {
    const { ses, jar, calls } = fake(JAR())
    await clearAllSites(ses)
    expect(jar).toEqual([])
    expect(calls.cache).toBe(1)
  })
})

describe('keepSessionCookies', () => {
  type Seen = { cookie: Record<string, unknown>; cause?: string; removed?: boolean }
  function hook() {
    const set: Record<string, unknown>[] = []
    let on: ((e: unknown, cookie: never, cause: string, removed: boolean) => void) | undefined
    keepSessionCookies({ on: (_: 'changed', cb: typeof on) => ((on = cb), undefined), set: async (d: Record<string, unknown>) => void set.push(d) } as never, () => 1_000_000)
    const fire = ({ cookie, cause = 'explicit', removed = false }: Seen) => on!({}, cookie as never, cause, removed)
    return { set, fire }
  }
  const session = { name: 'sid', value: 'v', domain: 'github.com', hostOnly: true, path: '/app', secure: true, httpOnly: true, session: true, sameSite: 'lax' }

  it('gives a session cookie an expiry thirty days on, so it is still there after the app quits', () => {
    const { set, fire } = hook()
    fire({ cookie: session })
    expect(set).toEqual([{ url: 'https://github.com/app', name: 'sid', value: 'v', path: '/app', secure: true, httpOnly: true, sameSite: 'lax', expirationDate: 1_000_000 + 30 * 86400 }])
  })

  it('keeps a cookie bound to its host: no domain is given, which would widen it to the subdomains', () => {
    const { set, fire } = hook()
    fire({ cookie: session })
    expect(set[0]).not.toHaveProperty('domain')
  })

  it('keeps a domain cookie a domain cookie, on its scheme', () => {
    const { set, fire } = hook()
    fire({ cookie: { ...session, domain: '.example.com', hostOnly: false, secure: false } })
    expect(set[0]).toMatchObject({ url: 'http://example.com/app', domain: '.example.com', secure: false })
  })

  it('leaves a cookie that already has an expiry, and one that was removed', () => {
    const { set, fire } = hook()
    fire({ cookie: { ...session, session: false, expirationDate: 5 } })
    fire({ cookie: session, removed: true, cause: 'expired' })
    expect(set).toEqual([])
  })
})
