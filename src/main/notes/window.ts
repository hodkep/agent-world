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

type Rect = { x: number; y: number; width: number; height: number }

/** The bounds with `extra` more width on the side of the screen that has room: to the right when it fits, else to the left (never past the left edge of the screen). */
export function growBounds(b: Rect, area: Rect, extra: number): { side: 'left' | 'right'; bounds: Rect } {
  if (b.x + b.width + extra <= area.x + area.width) return { side: 'right', bounds: { ...b, width: b.width + extra } }
  const x = Math.max(area.x, b.x - extra)
  return { side: 'left', bounds: { ...b, x, width: b.width + (b.x - x) } }
}

/** The bounds before a panel was added beside it. */
export function shrinkBounds(b: Rect, side: 'left' | 'right', extra: number): Rect {
  return side === 'left' ? { ...b, x: b.x + extra, width: b.width - extra } : { ...b, width: b.width - extra }
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
  // While a panel is open beside the note the window is wider; the place that is remembered is the note's own.
  let grown: { side: 'left' | 'right'; extra: number } | null = null
  const save = () => {
    if (!win || win.isDestroyed()) return
    state = { ...(grown ? shrinkBounds(win.getBounds(), grown.side, grown.extra) : win.getBounds()), pinned: state.pinned ?? true }
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
      // On a Mac the window keeps its own red, yellow and green buttons over a bar of our own; elsewhere it has no frame at all.
      ...(process.platform === 'darwin' ? { titleBarStyle: 'hidden' as const, trafficLightPosition: { x: 12, y: 12 } } : { frame: false }),
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
    /** Makes room for a panel of `extra` pixels beside the note (0 gives the room back); which side of the note it is on. */
    side(extra: number): 'left' | 'right' | null {
      const w = win && !win.isDestroyed() ? win : null
      if (!w) return null
      if (grown && (extra <= 0 || extra !== grown.extra)) {
        w.setBounds(shrinkBounds(w.getBounds(), grown.side, grown.extra))
        grown = null
      }
      if (extra <= 0) return null
      if (grown) return grown.side
      const b = w.getBounds()
      const g = growBounds(b, screen.getDisplayMatching(b).workArea, extra)
      grown = { side: g.side, extra: g.bounds.width - b.width }
      w.setBounds(g.bounds)
      return g.side
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
