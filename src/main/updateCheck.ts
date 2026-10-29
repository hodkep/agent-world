import type { UpdateRel } from '../shared/updateInstall'

export interface Repo {
  owner: string
  repo: string
}

export interface ReleaseState {
  state: 'none' | 'available' | 'error'
  detail?: string
  /** The newer version, and the page of its release on GitHub. */
  latest?: string
  url?: string
  /** The release's own text (Markdown), when it has any: what the new version holds. */
  notes?: string
  /** When the release was published (beta looks only), as GitHub says it. */
  date?: string
  /** How `latest` stands to the version installed, when the look was the person's own (Settings). */
  rel?: UpdateRel
}

/** The GitHub repository of the `repository` field of package.json: "github:owner/repo", an address, or {url}. */
export function parseRepo(field: unknown): Repo | null {
  const text = typeof field === 'string' ? field : field && typeof field === 'object' && typeof (field as { url?: unknown }).url === 'string' ? (field as { url: string }).url : ''
  const m = /^(?:github:|(?:git\+)?https?:\/\/github\.com\/|git@github\.com:)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(text.trim())
  if (!m || (/^(?:https?:\/\/|git\+)/.test(text) && !/github\.com/.test(text))) return null
  return { owner: m[1]!, repo: m[2]! }
}

const parse = (v: string) => {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([\w.-]+))?$/.exec(v.trim())
  return m ? { core: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4]?.split('.') } : null
}

/** Semver order of two pre-release parts: none (a release) is after any; else part by part, numbers as numbers and before words. */
function comparePre(a?: string[], b?: string[]): number {
  if (!a || !b) return a === b ? 0 : a ? -1 : 1
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i]
    const y = b[i]
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1
    if (x === y) continue
    const nx = /^\d+$/.test(x)
    const ny = /^\d+$/.test(y)
    if (nx && ny) return Number(x) - Number(y)
    if (nx !== ny) return nx ? -1 : 1
    return x < y ? -1 : 1
  }
  return 0
}

/** What package.json inside the app says: its repository, and whether the release workflow signed this build with a Developer ID (it adds `awSigned`), and the mirror it names (`awMirror`: where an update is tried first). */
export function buildInfo(pkg: unknown): { repo: Repo | null; signed: boolean; mirror: string | null } {
  const p = (pkg && typeof pkg === 'object' ? pkg : {}) as { repository?: unknown; awSigned?: unknown; awMirror?: unknown }
  return { repo: parseRepo(p.repository), signed: p.awSigned === true, mirror: typeof p.awMirror === 'string' ? p.awMirror : null }
}

/** Is `tag` a version after `current`? A pre-release of the version you have is not, but a release is after its own betas, and beta.2 after beta.1. A tag that is not a version is no one. */
export function isNewer(current: string, tag: string): boolean {
  const a = parse(current)
  const b = parse(tag)
  if (!a || !b) return false
  for (let i = 0; i < 3; i++) if (a.core[i] !== b.core[i]) return b.core[i]! > a.core[i]!
  return comparePre(a.pre, b.pre) < 0
}

/** Whether this copy was installed with Homebrew: the cask keeps a folder named for it in the prefix's Caskroom (Apple Silicon and Intel keep theirs apart). */
export const isHomebrewInstall = (caskrooms: string[], exists: (path: string) => boolean): boolean => caskrooms.some((root) => exists(`${root}/agent-world`))

/**
 * Whether an installed app can install an update itself. macOS replaces an app only with one signed by the same Developer ID, so a Mac build that was
 * signed ad hoc can find out that a newer one exists but not put it in place: it tells the person and points to the release page.
 */
export function updateMode(o: { packaged: boolean; platform: NodeJS.Platform; signed: boolean }): 'install' | 'tell' | 'off' {
  if (!o.packaged) return 'off'
  return o.platform === 'darwin' && !o.signed ? 'tell' : 'install'
}

/**
 * Looks by itself: once a little after the app starts and again every three hours while it is open. A look that is still running is not started again,
 * and one that failed (no network) is simply tried at the next time. Returns what stops it.
 */
export function startChecks(run: () => Promise<unknown>, o: { startMs?: number; everyMs?: number } = {}): () => void {
  let busy = false
  const look = () => {
    if (busy) return
    busy = true
    void run().catch(() => undefined).finally(() => (busy = false))
  }
  const first = setTimeout(look, o.startMs ?? 15_000)
  const every = setInterval(look, o.everyMs ?? 3 * 3600_000)
  return () => (clearTimeout(first), clearInterval(every))
}

type Fetch = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

/** The notes a release carries in its answer: its text, when it has some, cut so a huge one cannot weigh on the window. */
export const NOTES_MAX = 20_000
function releaseNotesOf(body: unknown): string | undefined {
  if (typeof body !== 'string' || !body.trim()) return undefined
  return body.length > NOTES_MAX ? `${body.slice(0, NOTES_MAX)}…` : body
}

type Origins = { api: string; downloads: string }
const GITHUB: Origins = { api: 'https://api.github.com', downloads: 'https://github.com' }

const relOf = (current: string, tag: string): UpdateRel => (isNewer(current, tag) ? 'newer' : isNewer(tag, current) ? 'older' : 'same')

/**
 * What a look found: the release, its page, and (when the person asked, `kind`) how it stands to `current`. A release that is the version installed
 * is not offered, only said ("You have 0.7.0."); an older one is offered, with its place said in the line.
 */
function found(tag: string, repo: Repo, origins: Origins, body: unknown, date?: unknown, ask?: { current: string; kind: 'stable' | 'beta' }): ReleaseState {
  const notes = releaseNotesOf(body)
  const latest = tag.replace(/^v/, '')
  const rel = ask ? relOf(ask.current, tag) : undefined
  // The page is built from the repository and the tag, not taken from the answer: only a page of this repository is ever opened.
  const url = `${origins.downloads}/${repo.owner}/${repo.repo}/releases/tag/${encodeURIComponent(tag)}`
  const detail = rel === 'same' ? `You have ${latest}.` : rel === 'older' ? `${latest} is the ${ask!.kind === 'beta' ? 'newest beta' : 'latest stable'}, older than the version you have.` : `${latest} is available.`
  return { state: rel === 'same' ? 'none' : 'available', detail, latest, ...(rel && { rel }), ...(notes && { notes }), ...(typeof date === 'string' && { date }), url }
}

const unreachable = (e: unknown): ReleaseState => ({ state: 'error', detail: `Could not reach GitHub: ${(e as Error).message.split('\n')[0]}` })

/**
 * Asks GitHub for the latest release of the repository and says whether it is newer than `current`, with the page of that release.
 * With `all` (a look the person asked for in Settings) it is the latest release whatever version is installed, with how it stands to it.
 */
export async function latestRelease(current: string, repo: Repo, get: Fetch, origins: Origins = GITHUB, o: { all?: boolean } = {}): Promise<ReleaseState> {
  try {
    const res = await get(`${origins.api}/repos/${repo.owner}/${repo.repo}/releases/latest`)
    if (res.status === 404) return { state: 'none', detail: 'No release is published yet.' }
    if (!res.ok) return { state: 'error', detail: `GitHub did not answer (${res.status}).` }
    const answer = (await res.json()) as { tag_name?: unknown; body?: unknown }
    const tag = String(answer.tag_name ?? '')
    if (!parse(tag) || (!o.all && !isNewer(current, tag))) return { state: 'none' }
    return found(tag, repo, origins, answer.body, undefined, o.all ? { current, kind: 'stable' } : undefined)
  } catch (e) {
    return unreachable(e)
  }
}

/** Asks GitHub for the recent releases and takes the newest pre-release tagged -beta.N, whatever version is installed. Never looked for by itself: only when the person asks. */
export async function latestBeta(current: string, repo: Repo, get: Fetch, origins: Origins = GITHUB): Promise<ReleaseState> {
  try {
    const res = await get(`${origins.api}/repos/${repo.owner}/${repo.repo}/releases?per_page=30`)
    if (!res.ok) return { state: 'error', detail: `GitHub did not answer (${res.status}).` }
    const list = (await res.json()) as unknown
    type Rel = { tag_name?: unknown; prerelease?: unknown; draft?: unknown; body?: unknown; published_at?: unknown }
    let best: Rel | undefined
    for (const r of Array.isArray(list) ? (list as Rel[]) : []) {
      const tag = String(r?.tag_name ?? '')
      if (r?.draft === true || r?.prerelease !== true || !/^v?\d+\.\d+\.\d+-beta\.\d+$/.test(tag)) continue
      if (!best || isNewer(String(best.tag_name), tag)) best = r
    }
    return best ? found(String(best.tag_name), repo, origins, best.body, best.published_at, { current, kind: 'beta' }) : { state: 'none', detail: 'No beta has been published.' }
  } catch (e) {
    return unreachable(e)
  }
}
