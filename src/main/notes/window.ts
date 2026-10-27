import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { BrowserWindow, screen } from 'electron'

interface State {
  x: number
  y: number
  width: number
  height: number
  /** Whether it stays above other windows (the pin). */
  pinned: boolean
}

const SIZE = { width: 380, height: 560 }

/** Bounds that are on a screen that is there now; else a place at the right edge of the main screen. */
export function placeFor(saved: Partial<State> | undefined, areas: { x: number; y: number; width: number; height: number }[]): Pick<State, 'x' | 'y' | 'width' | 'height'> {
  const width = Math.max(280, saved?.width ?? SIZE.width)
  const height = Math.max(220, saved?.height ?? SIZE.height)
  const home = areas[0] ?? { x: 0, y: 0, width: 1440, height: 900 }
  if (saved?.x !== undefined && saved.y !== undefined) {
    const on = areas.some((a) => saved.x! + 60 > a.x && saved.x! + 60 < a.x + a.width && saved.y! + 30 > a.y && saved.y! + 30 < a.y + a.height)
    if (on) return { x: saved.x, y: saved.y, width, height }
  }
  return { x: home.x + home.width - width - 40, y: home.y + 80, width, height }
}

/** The notes window: frameless, above every other window and on every desktop, where the person put it last. It is hidden when closed, not destroyed, so it comes back at once with its note as it was. */
export function createNotesWindow(o: { preload: string; load: (w: BrowserWindow) => void; stateFile: string; hidden: boolean }) {
  let win: BrowserWindow | null = null
  let state: Partial<State> = {}
  try {
    if (existsSync(o.stateFile)) state = JSON.parse(readFileSync(o.stateFile, 'utf8'))
  } catch {
    state = {}
  }
  let quitting = false
  let timer: ReturnType<typeof setTimeout> | null = null
  const save = () => {
    if (!win || win.isDestroyed()) return
    state = { ...win.getBounds(), pinned: state.pinned ?? true }
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void writeFileSync(o.stateFile, JSON.stringify(state)), 300)
  }
  const pin = (on: boolean) => {
    state.pinned = on
    if (!win || win.isDestroyed()) return
    // Above other apps' windows and on every desktop, even over one in full screen.
    win.setAlwaysOnTop(on, 'floating')
    win.setVisibleOnAllWorkspaces(on, { visibleOnFullScreen: on })
    save()
  }
  const make = (): BrowserWindow => {
    const w = new BrowserWindow({
      show: false,
      frame: false,
      ...placeFor(state, screen.getAllDisplays().map((d) => d.workArea)),
      minWidth: 280,
      minHeight: 220,
      backgroundColor: '#1a1726',
      title: 'Agent World Notes',
      skipTaskbar: true,
      fullscreenable: false,
      webPreferences: { preload: o.preload, sandbox: true, contextIsolation: true, zoomFactor: Number(process.env.AW_ZOOM) || 1.2 }
    })
    win = w
    pin(state.pinned ?? true)
    w.on('moved', save)
    w.on('resized', save)
    w.on('close', (e) => {
      if (quitting) return
      e.preventDefault()
      w.hide()
    })
    w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    w.webContents.on('will-navigate', (e) => e.preventDefault())
    o.load(w)
    return w
  }
  const get = () => (win && !win.isDestroyed() ? win : make())
  return {
    win: () => (win && !win.isDestroyed() ? win : null),
    show() {
      const w = get()
      if (o.hidden) return
      w.show()
      w.focus()
    },
    hide: () => win?.hide(),
    toggle() {
      const w = win && !win.isDestroyed() ? win : null
      if (w?.isVisible() && w.isFocused()) w.hide()
      else this.show()
    },
    pin,
    pinned: () => state.pinned ?? true,
    /** For a test: the window exists (and loads) without being shown. */
    ensure: get,
    send: (channel: string, ...args: unknown[]) => win && !win.isDestroyed() && win.webContents.send(channel, ...args),
    quit() {
      quitting = true
    }
  }
}

export type NotesWindow = ReturnType<typeof createNotesWindow>
