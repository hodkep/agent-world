/** What the Preview's session holds for each site, and clearing it, one site or all. Written against the few Session members used, so it is tested without Electron. */
export type SiteSession = {
  cookies: {
    get(filter: object): Promise<{ domain?: string; name: string; path?: string; secure?: boolean }[]>
    remove(url: string, name: string): Promise<void>
  }
  clearStorageData(options?: { origin?: string }): Promise<void>
  clearCache(): Promise<void>
}
export type Site = { host: string; cookies: number }

const bare = (domain = '') => domain.replace(/^\./, '').toLowerCase()
const nameOf = (host: string) => host.replace(/:\d+$/, '')
const reaches = (domain: string, host: string) => host === domain || host.endsWith(`.${domain}`)
const VALID = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/

/** The sites with cookies, most first; and the page being shown (which also holds the cookies set by its parent domains) apart from them, even when it holds nothing. */
export async function listSites(ses: SiteSession, current?: string): Promise<{ current: Site | null; others: Site[] }> {
  const here = current ? nameOf(current) : ''
  const counts = new Map<string, number>()
  let mine = 0
  for (const k of await ses.cookies.get({})) {
    const d = bare(k.domain)
    if (here && reaches(d, here)) mine++
    else counts.set(d, (counts.get(d) ?? 0) + 1)
  }
  const others = [...counts].map(([host, cookies]) => ({ host, cookies })).sort((a, b) => b.cookies - a.cookies || a.host.localeCompare(b.host))
  return { current: current ? { host: current, cookies: mine } : null, others }
}

/**
 * Everything one site keeps: its cookies, and its stored data on both schemes. The cookies of its subdomains go too, and so do the parent domains' that it sees,
 * so the page really is logged out. Only the cookies say which subdomains hold anything: the others cannot be listed, so they are cleared with "all".
 */
export async function clearSite(ses: SiteSession, site: string): Promise<void> {
  const host = site.toLowerCase()
  if (!VALID.test(host) || host.includes('..')) throw new Error(`Not a site: ${JSON.stringify(site)}`)
  const name = nameOf(host)
  const hosts = new Set([host])
  for (const k of await ses.cookies.get({})) {
    const d = bare(k.domain)
    if (!reaches(d, name) && !reaches(name, d)) continue
    hosts.add(d)
    await ses.cookies.remove(`${k.secure ? 'https' : 'http'}://${d}${k.path ?? '/'}`, k.name)
  }
  for (const h of hosts) for (const scheme of ['https', 'http']) await ses.clearStorageData({ origin: `${scheme}://${h}` })
}

export async function clearAllSites(ses: SiteSession): Promise<void> {
  await ses.clearStorageData()
  await ses.clearCache()
}

const KEEP_SECONDS = 30 * 86400

type Cookie = { name: string; value: string; domain?: string; hostOnly?: boolean; path?: string; secure?: boolean; httpOnly?: boolean; session?: boolean; sameSite?: Same }
type Same = 'unspecified' | 'no_restriction' | 'lax' | 'strict'
export type CookieJar = {
  on(event: 'changed', cb: (e: unknown, cookie: Cookie, cause: string, removed: boolean) => void): unknown
  set(details: { url: string; name: string; value: string; domain?: string; path?: string; secure?: boolean; httpOnly?: boolean; sameSite?: Same; expirationDate?: number }): Promise<void>
}

/**
 * Chromium drops a cookie with no expiry when the app quits, and most logins are one: each would be gone at every start. So a cookie that arrives without an expiry is set again with one,
 * thirty days on (and again at each change, so a site in use stays logged in). Its host binding is kept: with no domain given it stays on its own host, not its subdomains.
 */
export function keepSessionCookies(jar: CookieJar, now: () => number = () => Date.now() / 1000): void {
  jar.on('changed', (_, k, __, removed) => {
    if (removed || !k.session) return
    const host = bare(k.domain)
    const path = k.path ?? '/'
    void jar
      .set({ url: `${k.secure ? 'https' : 'http'}://${host}${path}`, name: k.name, value: k.value, ...(k.hostOnly ? {} : { domain: k.domain }), path, secure: k.secure, httpOnly: k.httpOnly, sameSite: k.sameSite, expirationDate: now() + KEEP_SECONDS })
      .catch(() => undefined)
  })
}
