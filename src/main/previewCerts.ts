/** What verdict of a failed certificate: 0 accepts it, -3 leaves it refused. */
const ACCEPT = 0
const USE_CHROMIUM = -3

/**
 * The Preview pages' certificate check. Chromium's verdict stands, except for a site the person chose "Continue anyway" on after it failed:
 * that host (not its subdomains) is accepted until the app closes. Only a host that has just failed can be allowed, so a page or an agent cannot allow one ahead of time.
 */
export function createCertGate() {
  const failed = new Set<string>()
  const allowed = new Set<string>()
  const key = (host: string) => host.toLowerCase()
  return {
    check(host: string, result: string): number {
      const h = key(host)
      if (allowed.has(h)) return ACCEPT
      if (result !== 'net::OK') failed.add(h)
      return USE_CHROMIUM
    },
    allow(host: string): boolean {
      const h = key(host)
      if (!failed.has(h)) return false
      allowed.add(h)
      return true
    },
    /** The hosts the person went past, for the address bar to say so. */
    allowed: (): string[] => [...allowed]
  }
}
