import { app } from 'electron'

export type UpdateState = { state: 'off' | 'checking' | 'none' | 'available' | 'ready' | 'error'; detail?: string }

let current: UpdateState = { state: 'off' }
let started = false

/**
 * Looks for a newer build at the address given in Settings (a folder that serves the files electron-builder produces).
 * Nothing runs for a development build or without an address: there is no built-in update server.
 */
export async function checkForUpdates(feedUrl: string, onState: (s: UpdateState) => void): Promise<UpdateState> {
  const set = (s: UpdateState) => ((current = s), onState(s), s)
  if (!app.isPackaged || !/^https?:\/\//.test(feedUrl)) return set({ state: 'off', detail: app.isPackaged ? 'Enter an update address in Settings.' : 'Updates only work in the installed app.' })
  try {
    const { autoUpdater } = await import('electron-updater')
    autoUpdater.autoDownload = true
    autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl })
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
