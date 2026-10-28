import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Repo } from '../updateCheck'
import type { InstallState } from '../../shared/updateInstall'
import { type Fetch, downloadAsset, fetchText } from './download'
import { INSTALL_SCRIPT, installBlocker } from './installScript'
import { assetFor, parseLatestMac } from './manifest'
import type { ReleaseOrigins } from './origins'

/** The bundle identifier the new app must have (it is the appId of electron-builder.yml). */
export const BUNDLE_ID = 'dev.agentworld.app'
export type { InstallState }

export interface InstallerDeps {
  current: string
  /** The person chose the release in Settings: it is downloaded though it is not newer than the running version. */
  any?: boolean
  repo: Repo
  arch: string
  appPath: string
  pid: number
  updatesDir: string
  fetch: Fetch
  /** Where releases are downloaded from, and which addresses may be fetched (GitHub's, unless a test's own server stands in). */
  origins: ReleaseOrigins
  place: () => { parentWritable: boolean; readOnlyVolume: boolean }
  /** Runs the helper script detached, so it outlives the app. */
  launch: (script: string, args: string[]) => void
  quit: () => void
  onState: (s: InstallState) => void
}

/**
 * Downloading, checking and installing a newer version of an app that cannot use the standard updater (a Mac build without a Developer ID). Everything
 * it fetches comes from addresses built from the repository and the tag; everything it writes is in `updatesDir`, apart from the app itself, which the
 * helper replaces after this process has quit. Nothing here asks for a password.
 */
export function createInstaller(d: InstallerDeps) {
  let state: InstallState = { phase: 'idle' }
  let running: Promise<void> | null = null
  let abort: AbortController | null = null
  const set = (s: InstallState) => ((state = s), d.onState(s))
  const result = join(d.updatesDir, 'update.result')

  async function run(tag: string) {
    abort = new AbortController()
    const base = `${d.origins.downloads}/${d.repo.owner}/${d.repo.repo}/releases/download/${encodeURIComponent(tag)}`
    const got = await fetchText(`${base}/latest-mac.yml`, d.fetch, abort.signal, d.origins.allow)
    if (!got.ok) return set({ phase: 'failed', kind: got.kind, reason: got.reason })
    const manifest = parseLatestMac(got.text)
    if (!manifest) return set({ phase: 'failed', kind: 'manifest', reason: 'The release information could not be read.' })
    const pick = assetFor({ manifest, arch: d.arch, current: d.current, repo: d.repo, tag, downloads: d.origins.downloads, any: d.any })
    if (!pick.ok) return set({ phase: 'failed', kind: 'manifest', reason: pick.reason })
    const version = pick.asset.version
    set({ phase: 'downloading', version, received: 0, total: pick.asset.size })
    const r = await downloadAsset({ asset: pick.asset, dir: join(d.updatesDir, version), fetch: d.fetch, signal: abort.signal, allow: d.origins.allow, onProgress: (received, total) => set({ phase: 'downloading', version, received, total }) })
    set(r.ok ? { phase: 'ready', version, file: r.file } : { phase: 'failed', version, kind: r.kind, reason: r.reason })
  }

  return {
    state: () => state,
    /** Downloads the release of this tag; a second call while one runs does nothing. */
    download(tag: string): Promise<void> {
      if (running) return running
      running = run(tag).finally(() => ((running = null), (abort = null)))
      return running
    },
    cancel: () => abort?.abort(),
    /** Replaces the app with the downloaded version: where that is not possible it says why and keeps the file; otherwise the helper is started and the app quits. */
    install() {
      if (state.phase !== 'ready') return
      const { version, file } = state
      const why = installBlocker({ appPath: d.appPath, ...d.place() })
      if (why) return set({ phase: 'failed', version, kind: 'blocked', reason: why, file })
      mkdirSync(d.updatesDir, { recursive: true })
      const script = join(d.updatesDir, 'install.sh')
      writeFileSync(script, INSTALL_SCRIPT, { mode: 0o700 })
      chmodSync(script, 0o700)
      rmSync(result, { force: true })
      set({ phase: 'installing', version })
      d.launch(script, [String(d.pid), file, d.appPath, version, BUNDLE_ID, join(d.updatesDir, 'update.log'), result])
      d.quit()
    },
    /** Why the last install did not happen, once, after the restart that followed it; nothing when it worked or there was none. */
    lastFailure(): string | null {
      try {
        const text = readFileSync(result, 'utf8')
        rmSync(result, { force: true })
        const m = /^failed:\s*(.+)$/m.exec(text)
        return m ? m[1]!.trim() : null
      } catch {
        return null
      }
    }
  }
}
