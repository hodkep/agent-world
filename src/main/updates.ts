import { app, shell } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { type BetaState, type InstallState, type UpdateChannel, type UpdateRel, lookAllowed } from '../shared/updateInstall'
import { createInstaller } from './inAppUpdate/installer'
import { type Mirror, mirrorOf } from './inAppUpdate/mirror'
import { helperEnv, releaseOrigins } from './inAppUpdate/origins'
import { placeOf } from './inAppUpdate/installScript'
import { buildInfo, isHomebrewInstall, latestBeta, latestRelease, updateMode } from './updateCheck'
import { updateFeed } from './updateFeed'

/** `latest` and `url` are set when a newer version is out but this build cannot install it itself: the page of its release is what the person is pointed to. */
export type UpdateState = { /** Installed with Homebrew: updated from here too, though Homebrew's own record of the version may lag. */ homebrew?: boolean; state: 'off' | 'checking' | 'none' | 'available' | 'ready' | 'error'; detail?: string; latest?: string; url?: string; /** How `latest` stands to the version installed (set by a look the person asked for in Settings, never by the three-hourly look). */ rel?: UpdateRel; /** The new version's own notes (Markdown), from the same answer. */ notes?: string; /** The release's tag, and (for an unsigned Mac build) where its in-app download and install stand. */ tag?: string; /** The last beta look, apart from the stable fields above. */ beta?: BetaState; /** The version running now. */ current?: string; install?: InstallState }

/** The version running now. A build that is not installed (a test run) may say another one in AW_APP_VERSION, to stand in for an installed beta. */
export const runningVersion = () => (!app.isPackaged && process.env.AW_APP_VERSION) || app.getVersion()

/** Whether the person has the mirror on (the `updateMirror` preference); main sets it from the preferences. */
let mirrorOn = () => true
export const setMirrorSwitch = (on: () => boolean) => {
  mirrorOn = on
}
/** Where the zip is tried first: the mirror the build names, or a test run's own, unless it is switched off. A test run that names none uses none. */
const mirrorFor = (named: string | null, origins: ReturnType<typeof releaseOrigins>): Mirror | null => (!mirrorOn() ? null : origins.testing ? (origins.mirror ?? null) : (origins.mirror ?? mirrorOf(named)))

let current: UpdateState = { state: 'off' }
/** One installer for each channel: a stable download and a beta download do not share a progress bar. */
const installers: Partial<Record<UpdateChannel, ReturnType<typeof createInstaller>>> = {}

/** The app bundle this process runs from: three folders above its executable (Agent World.app/Contents/MacOS/Agent World). A test run has no real bundle to replace: it names a fake one, or none (and then nothing is installed). */
const appBundle = (testing = false) => (testing ? (process.env.AW_UPDATE_APP_PATH ?? '') : dirname(dirname(dirname(app.getPath('exe')))))

/** Downloads the newer release the last look of this channel found (unsigned Mac build only); its progress comes through the update state. */
export const downloadUpdate = (channel: UpdateChannel = 'stable') => {
  const tag = channel === 'beta' ? current.beta?.tag : current.tag
  const installer = installers[channel]
  return installer && tag ? installer.download(tag) : Promise.resolve()
}
export const cancelUpdateDownload = (channel: UpdateChannel = 'stable') => installers[channel]?.cancel()
/** Shows the downloaded file, or the update log, in Finder: what the person needs when the app cannot install by itself or an install failed. */
export function revealUpdate(kind: 'file' | 'log', channel: UpdateChannel = 'stable') {
  const dir = join(app.getPath('userData'), 'updates')
  const st = installers[channel]?.state()
  const file = st && (st.phase === 'ready' || st.phase === 'failed') ? st.file : undefined
  if (kind === 'file' && file && existsSync(file)) return shell.showItemInFolder(file)
  const log = join(dir, 'update.log')
  if (existsSync(log)) return shell.showItemInFolder(log)
  if (existsSync(dir)) void shell.openPath(dir)
}
/** Replaces the app with the downloaded version and restarts, or says why it will not. */
export const installUpdate = (channel: UpdateChannel = 'stable') => installers[channel]?.install()

/** What the last look found, for a window opened after it. */
export const updateState = (): UpdateState => current
let started = false

const getRelease = (url: string) => fetch(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'agent-world' } })

function installerFor(repo: NonNullable<ReturnType<typeof buildInfo>['repo']>, origins: ReturnType<typeof releaseOrigins>, onState: (i: InstallState) => void, any = false, named: string | null = null) {
  return createInstaller({
    current: runningVersion(),
    any,
    repo,
    arch: process.arch,
    appPath: appBundle(origins.testing),
    pid: process.pid,
    updatesDir: join(app.getPath('userData'), 'updates'),
    fetch: (url, init) => fetch(url, init),
    origins,
    mirror: mirrorFor(named, origins),
    place: () => placeOf(appBundle(origins.testing)),
    launch: (script, args) => spawn('/bin/sh', [script, ...args], { detached: true, stdio: 'ignore', env: helperEnv(app.isPackaged, process.env) }).unref(),
    quit: () => app.quit(),
    onState
  })
}

/** The package.json of the app, which says where its releases are; null when there is none to read. */
function readBuildInfo() {
  try {
    return buildInfo(JSON.parse(readFileSync(join(app.getAppPath(), 'package.json'), 'utf8')))
  } catch {
    return buildInfo(null)
  }
}

/**
 * The beta row of Settings: looks only when asked, at the newest -beta.N pre-release, and never touches the stable state, the top-bar chip or Homebrew.
 * Only a Mac can download it into place (the installer replaces an app bundle); elsewhere it points to the release page.
 */
async function checkBeta(onState: (s: UpdateState) => void): Promise<UpdateState> {
  if (!lookAllowed(installers.beta?.state())) return current
  const set = (b: BetaState) => ((current = { ...current, beta: b }), onState(current), current)
  const origins = releaseOrigins(app.isPackaged, process.env)
  const feed = updateFeed(app.isPackaged || origins.testing)
  if (feed.kind === 'off') return set({ state: 'off', detail: feed.detail })
  const info = readBuildInfo()
  if (!info.repo) return set({ state: 'off', detail: 'This build does not say where its releases are.' })
  set({ state: 'checking' })
  const found = await latestBeta(runningVersion(), info.repo, getRelease, origins)
  if (found.state !== 'available' || !found.latest) return set(found)
  if (!origins.testing && process.platform !== 'darwin') return set(found)
  const installer = (installers.beta = installerFor(info.repo, origins, (i) => current.beta && set({ ...current.beta, install: i }), true, info.mirror))
  const failure = installer.lastFailure()
  return set({ ...found, tag: `v${found.latest}`, ...(failure && { install: { phase: 'failed' as const, kind: 'install' as const, reason: `The last update was not installed: ${failure}` } }) })
}

/**
 * Looks for a newer build in the releases of the project on GitHub, which the build bakes into the installed app (its publish setting).
 * Nothing runs for a development build.
 */
export async function checkForUpdates(onState: (s: UpdateState) => void, channel: UpdateChannel = 'stable', manual = false): Promise<UpdateState> {
  if (channel === 'beta') return checkBeta(onState)
  // A download under way, or waiting for the restart, is left as it is: looking again would start it over.
  if (!lookAllowed(installers.stable?.state())) return current
  // The beta row is its own: a stable look keeps what the last beta look found.
  const set = (s: UpdateState) => ((current = { ...s, ...(current.beta && { beta: current.beta }) }), onState(current), current)
  // A test run (an app that is not installed) may stand its own server in for GitHub; an installed app never does (see releaseOrigins).
  const origins = releaseOrigins(app.isPackaged, process.env)
  const feed = updateFeed(app.isPackaged || origins.testing)
  if (feed.kind === 'off') return set({ state: 'off', detail: feed.detail })
  // A Mac build signed only ad hoc cannot be replaced by an update (macOS refuses), so it is told a newer one exists and where to get it.
  const info = readBuildInfo()
  if (updateMode({ packaged: app.isPackaged || origins.testing, platform: origins.testing ? 'darwin' : process.platform, signed: info.signed }) === 'tell') {
    if (!info.repo) return set({ state: 'off', detail: 'This build does not say where its releases are.' })
    set({ state: 'checking' })
    const found = await latestRelease(runningVersion(), info.repo, getRelease, origins, { all: manual })
    if (found.state !== 'available' || !found.latest) return set(found)
    // A copy Homebrew installed is updated here like any other; the state says so, so the person is told Homebrew's record of the version may lag.
    const casks = origins.testing ? [process.env.AW_UPDATE_CASKROOM ?? ''].filter(Boolean) : ['/opt/homebrew/Caskroom', '/usr/local/Caskroom']
    const homebrew = isHomebrewInstall(casks, existsSync)
    // Only this build can install by itself, from the same release it was told about.
    const installer = (installers.stable = installerFor(info.repo, origins, (i) => set({ ...current, install: i }), manual, info.mirror))
    const failure = installer.lastFailure()
    return set({ ...found, tag: `v${found.latest}`, current: runningVersion(), ...(homebrew && { homebrew }), ...(failure && { install: { phase: 'failed' as const, kind: 'install' as const, reason: `The last update was not installed: ${failure}` } }) })
  }
  try {
    const { autoUpdater } = await import('electron-updater')
    autoUpdater.autoDownload = true
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
