import { app } from 'electron'
import { updateFeed } from './updateFeed'

export type UpdateState = { state: 'off' | 'checking' | 'none' | 'available' | 'ready' | 'error'; detail?: string }

let current: UpdateState = { state: 'off' }
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
