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
}

/** The GitHub repository of the `repository` field of package.json: "github:owner/repo", an address, or {url}. */
export function parseRepo(field: unknown): Repo | null {
  const text = typeof field === 'string' ? field : field && typeof field === 'object' && typeof (field as { url?: unknown }).url === 'string' ? (field as { url: string }).url : ''
  const m = /^(?:github:|(?:git\+)?https?:\/\/github\.com\/|git@github\.com:)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(text.trim())
  if (!m || (/^(?:https?:\/\/|git\+)/.test(text) && !/github\.com/.test(text))) return null
  return { owner: m[1]!, repo: m[2]! }
}

const nums = (v: string): [number, number, number] | null => {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(-[\w.-]+)?$/.exec(v.trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

/** What package.json inside the app says: its repository, and whether the release workflow signed this build with a Developer ID (it adds `awSigned`). */
export function buildInfo(pkg: unknown): { repo: Repo | null; signed: boolean } {
  const p = (pkg && typeof pkg === 'object' ? pkg : {}) as { repository?: unknown; awSigned?: unknown }
  return { repo: parseRepo(p.repository), signed: p.awSigned === true }
}

/** Is `tag` a version after `current`? A pre-release of the version you have, or a tag that is not a version, is not. */
export function isNewer(current: string, tag: string): boolean {
  const a = nums(current)
  const b = nums(tag)
  if (!a || !b || /-/.test(tag.trim().replace(/^v/, '')) && a.join() === b.join()) return false
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return b[i]! > a[i]!
  return false
}

/**
 * Whether an installed app can install an update itself. macOS replaces an app only with one signed by the same Developer ID, so a Mac build that was
 * signed ad hoc can find out that a newer one exists but not put it in place: it tells the person and points to the release page.
 */
export function updateMode(o: { packaged: boolean; platform: NodeJS.Platform; signed: boolean }): 'install' | 'tell' | 'off' {
  if (!o.packaged) return 'off'
  return o.platform === 'darwin' && !o.signed ? 'tell' : 'install'
}

/**
 * Looks by itself: once a little after the app starts and again every six hours while it is open. A look that is still running is not started again,
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
  const every = setInterval(look, o.everyMs ?? 6 * 3600_000)
  return () => (clearTimeout(first), clearInterval(every))
}

type Fetch = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

/** Asks GitHub for the latest release of the repository and says whether it is newer than `current`, with the page of that release. */
export async function latestRelease(current: string, repo: Repo, get: Fetch, origins: { api: string; downloads: string } = { api: 'https://api.github.com', downloads: 'https://github.com' }): Promise<ReleaseState> {
  try {
    const res = await get(`${origins.api}/repos/${repo.owner}/${repo.repo}/releases/latest`)
    if (res.status === 404) return { state: 'none', detail: 'No release is published yet.' }
    if (!res.ok) return { state: 'error', detail: `GitHub did not answer (${res.status}).` }
    const tag = String(((await res.json()) as { tag_name?: unknown }).tag_name ?? '')
    if (!isNewer(current, tag)) return { state: 'none' }
    const latest = tag.replace(/^v/, '')
    // The page is built from the repository and the tag, not taken from the answer: only a page of this repository is ever opened.
    return { state: 'available', detail: `${latest} is available.`, latest, url: `${origins.downloads}/${repo.owner}/${repo.repo}/releases/tag/${encodeURIComponent(tag)}` }
  } catch (e) {
    return { state: 'error', detail: `Could not reach GitHub: ${(e as Error).message.split('\n')[0]}` }
  }
}
