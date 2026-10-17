import { app } from 'electron'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { InstallState } from '../shared/updateInstall'
import { createInstaller } from './inAppUpdate/installer'
import { placeOf } from './inAppUpdate/installScript'
import { buildInfo, latestRelease, updateMode } from './updateCheck'
import { updateFeed } from './updateFeed'

/** `latest` and `url` are set when a newer version is out but this build cannot install it itself: the page of its release is what the person is pointed to. */
export type UpdateState = { state: 'off' | 'checking' | 'none' | 'available' | 'ready' | 'error'; detail?: string; latest?: string; url?: string; /** The release's tag, and (for an unsigned Mac build) where its in-app download and install stand. */ tag?: string; install?: InstallState }

let current: UpdateState = { state: 'off' }
let installer: ReturnType<typeof createInstaller> | null = null

/** The app bundle this process runs from: three folders above its executable (Agent World.app/Contents/MacOS/Agent World). */
const appBundle = () => dirname(dirname(dirname(app.getPath('exe'))))

/** Downloads the newer release the last look found (unsigned Mac build only); its progress comes through the update state. */
export const downloadUpdate = () => (installer && current.tag ? installer.download(current.tag) : Promise.resolve())
export const cancelUpdateDownload = () => installer?.cancel()
/** Replaces the app with the downloaded version and restarts, or says why it will not. */
export const installUpdate = () => installer?.install()

/** What the last look found, for a window opened after it. */
export const updateState = (): UpdateState => current
let started = false

/**
 * Looks for a newer build: at the address given in Settings (a folder that serves the files electron-builder produces) when there is one,
 * and otherwise in the releases of the project on GitHub, which the build bakes into the installed app (its publish setting).
 * Nothing runs for a development build. An address cleared in Settings takes effect after a restart.
 */
export async function checkForUpdates(feedUrl: string, onState: (s: UpdateState) => void): Promise<UpdateState> {
  const set = (s: UpdateState) => ((current = s), onState(s), s)
  const feed = updateFeed(feedUrl, app.isPackaged)
  if (feed.kind === 'off') return set({ state: 'off', detail: feed.detail })
  // A Mac build signed only ad hoc cannot be replaced by an update (macOS refuses), so it is told a newer one exists and where to get it.
  let pkg: unknown = null
  try {
    pkg = JSON.parse(readFileSync(join(app.getAppPath(), 'package.json'), 'utf8'))
  } catch {
    /* no package.json to read: the build says nothing about itself */
  }
  const info = buildInfo(pkg)
  if (feed.kind === 'github' && updateMode({ packaged: app.isPackaged, platform: process.platform, signed: info.signed }) === 'tell') {
    if (!info.repo) return set({ state: 'off', detail: 'This build does not say where its releases are.' })
    set({ state: 'checking' })
    const found = await latestRelease(app.getVersion(), info.repo, (url) => fetch(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'agent-world' } }))
    if (found.state !== 'available' || !found.latest) return set(found)
    // Only this build can install by itself, from the same release it was told about.
    installer = createInstaller({
      current: app.getVersion(),
      repo: info.repo,
      arch: process.arch,
      appPath: appBundle(),
      pid: process.pid,
      updatesDir: join(app.getPath('userData'), 'updates'),
      fetch: (url, init) => fetch(url, init),
      place: () => placeOf(appBundle()),
      launch: (script, args) => spawn('/bin/sh', [script, ...args], { detached: true, stdio: 'ignore' }).unref(),
      quit: () => app.quit(),
      onState: (i) => set({ ...current, install: i })
    })
    const failure = installer.lastFailure()
    return set({ ...found, tag: `v${found.latest}`, ...(failure && { install: { phase: 'failed' as const, kind: 'manifest' as const, reason: `The last update was not installed: ${failure}` } }) })
  }
  try {
    const { autoUpdater } = await import('electron-updater')
    autoUpdater.autoDownload = true
    if (feed.kind === 'generic') autoUpdater.setFeedURL({ provider: 'generic', url: feed.url })
    if (!started) {
      started = true
      autoUpdater.on('update-available', (i) => set({ state: 'available', detail: `Downloading ${i.version}…` }))
      autoUpdater.on('update-not-available', () => set({ state: 'none' }))
      autoUpdater.on('update-downloaded', (i) => set({ state: 'ready', detail: `${i.version} is ready; it installs when you quit.` }))
      autoUpdater.on('error', (e) => set({ state: 'error', detail: e.message.split('\n')[0] }))
    }
    set({ state: 'checking' })
    await autoUpdater.checkForUpdates()
  } catch (e) {
    set({ state: 'error', detail: (e as Error).message.split('\n')[0] })
  }
  return current
}
