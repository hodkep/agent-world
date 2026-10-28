import { type Repo, isBeta, isNewer } from '../updateCheck'

/** The largest download that is accepted: the zip is about 290 MB today. */
export const MAX_BYTES = 600 * 1024 * 1024

export interface ManifestFile {
  url: string
  sha512: string
  size: number
}
export interface Manifest {
  version: string
  files: ManifestFile[]
}

/** What the update is to download: built here from the repository and the tag, with the checksum and size the release published. */
export interface Asset {
  version: string
  name: string
  url: string
  sha512: string
  size: number
}

const unquote = (v: string) => v.trim().replace(/^(['"])(.*)\1$/, '$2')

/**
 * Reads latest-mac.yml, which electron-builder writes beside the release: the version and, for each file, its name, sha512 (base64) and size.
 * It reads that one shape and nothing else, so nothing in the text is ever run or followed.
 */
export function parseLatestMac(text: string): Manifest | null {
  let version = ''
  const files: ManifestFile[] = []
  let at: Partial<ManifestFile> | null = null
  let inFiles = false
  const close = () => {
    if (at) files.push({ url: at.url ?? '', sha512: at.sha512 ?? '', size: at.size ?? NaN })
    at = null
  }
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '')
    const top = /^([A-Za-z0-9]+):\s*(.*)$/.exec(line)
    if (top) {
      if (inFiles) close()
      inFiles = top[1] === 'files'
      if (top[1] === 'version') version = unquote(top[2]!)
      continue
    }
    if (!inFiles) continue
    const start = /^\s+-\s+url:\s*(.+)$/.exec(line)
    if (start) {
      close()
      at = { url: unquote(start[1]!) }
      continue
    }
    const field = /^\s+(sha512|size):\s*(.+)$/.exec(line)
    if (field && at) {
      if (field[1] === 'sha512') at.sha512 = unquote(field[2]!)
      else at.size = Number(unquote(field[2]!))
    }
  }
  close()
  return /^\d+\.\d+\.\d+(-beta\.\d+)?$/.test(version) && files.length > 0 ? { version, files } : null
}

export type Pick = { ok: true; asset: Asset } | { ok: false; reason: string }

/**
 * The zip to download for this computer. The address is built from the repository and the tag (as the check builds the release page's), and the manifest
 * only names which file: a name that is a path or an address, another version, another processor or another kind of file is refused, and so is a
 * version that is not newer than the running one, or a size that is nothing or over the cap.
 */
export function assetFor(o: { manifest: Manifest; arch: string; current: string; repo: Repo; tag: string; downloads?: string; /** Going back from a beta: a stable release older than the running beta is accepted. */ back?: boolean }): Pick {
  const { manifest, arch, current, repo, tag } = o
  const downloads = o.downloads ?? 'https://github.com'
  if (!/^v?\d+\.\d+\.\d+(-beta\.\d+)?$/.test(tag) || tag.replace(/^v/, '') !== manifest.version) return { ok: false, reason: 'The release says another version than its tag.' }
  const back = o.back && isBeta(current) && !/-/.test(tag)
  if (!back && !isNewer(current, tag)) return { ok: false, reason: `${manifest.version} is not newer than ${current}.` }
  if (arch !== 'arm64' && arch !== 'x64') return { ok: false, reason: `There is no download for this kind of processor (${arch}).` }
  const name = `Agent-World-${manifest.version}-${arch}.zip`
  const file = manifest.files.find((f) => f.url === name)
  if (!file) return { ok: false, reason: `The release has no ${name}.` }
  if (!Number.isInteger(file.size) || file.size <= 0 || file.size > MAX_BYTES) return { ok: false, reason: `The size of ${name} is not one that is accepted.` }
  if (!file.sha512) return { ok: false, reason: `The release gives no checksum for ${name}.` }
  return { ok: true, asset: { version: manifest.version, name, url: `${downloads}/${repo.owner}/${repo.repo}/releases/download/${encodeURIComponent(tag)}/${name}`, sha512: file.sha512, size: file.size } }
}

const HOSTS = new Set(['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com'])

/** Whether a download may be fetched from this address, at the start and after each redirect: https, a host of GitHub's release downloads, no user or port. */
export function allowedHost(address: string): boolean {
  try {
    const u = new URL(address)
    return u.protocol === 'https:' && HOSTS.has(u.hostname) && u.username === '' && u.password === '' && (u.port === '' || u.port === '443')
  } catch {
    return false
  }
}
