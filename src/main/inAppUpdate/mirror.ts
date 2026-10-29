/** How long the mirror gets before the download goes to GitHub instead: no answer in 8 s, or under 150 KB/s over 15 s once the first 5 s are past. */
export interface Tune {
  headersMs: number
  graceMs: number
  windowMs: number
  minBps: number
}
export const TUNE: Tune = { headersMs: 8000, graceMs: 5000, windowMs: 15_000, minBps: 150 * 1024 }

/** The numbers a test run may shorten ("headers,grace,window[,bytesPerSecond]", in milliseconds); anything else is the real ones. */
export function parseTune(text?: string): Tune {
  const n = (text ?? '').split(',').map(Number)
  if (n.length < 3 || n.slice(0, 3).some((x) => !Number.isFinite(x) || x <= 0)) return TUNE
  return { headersMs: n[0]!, graceMs: n[1]!, windowMs: n[2]!, minBps: Number.isFinite(n[3]) && n[3]! > 0 ? n[3]! : TUNE.minBps }
}

export interface Mirror {
  /** The origin the build names (no path, no trailing slash). */
  base: string
  /** Whether an address may be fetched while the mirror is the source: its own exact host, and no redirect to anywhere else. */
  allow: (address: string) => boolean
  tune: Tune
}

/**
 * The mirror a build names (`awMirror` in its package.json): a plain https origin, or none. A test run may name an http origin of its own.
 * The mirror only ever supplies the bytes: the manifest comes from GitHub, and the size and sha512 it gives decide whether they are kept.
 */
export function mirrorOf(base: unknown, o: { testing?: boolean; tune?: Tune } = {}): Mirror | null {
  if (typeof base !== 'string') return null
  try {
    const u = new URL(base.trim())
    const scheme = o.testing ? /^https?:$/ : /^https:$/
    if (!scheme.test(u.protocol) || u.pathname !== '/' || u.search || u.hash || u.username || u.password || (!o.testing && u.port !== '' && u.port !== '443')) return null
    const origin = u.origin
    const allow = (a: string) => {
      try {
        const x = new URL(a)
        return x.origin === origin && x.username === '' && x.password === ''
      } catch {
        return false
      }
    }
    return { base: origin, allow, tune: o.tune ?? TUNE }
  } catch {
    return null
  }
}

/** Where the mirror keeps a release's file: <base>/v<version>/<name>. */
export const mirrorUrl = (m: Pick<Mirror, 'base'>, tag: string, name: string) => `${m.base}/${tag}/${encodeURIComponent(name)}`

/**
 * Whether a download has stalled: nothing is judged in the first `graceMs`; after that the bytes that came over each `windowMs` are counted, and
 * fewer than `minBps` a second is a stall. Called with the time and the bytes so far, as often as the caller likes.
 */
export function createStall(t: Tune, start: number): (now: number, got: number) => boolean {
  let from: { at: number; got: number } | null = null
  return (now, got) => {
    if (now < start + t.graceMs) return false
    if (!from) {
      from = { at: now, got }
      return false
    }
    if (now - from.at < t.windowMs) return false
    const slow = (got - from.got) / ((now - from.at) / 1000) < t.minBps
    from = { at: now, got }
    return slow
  }
}
