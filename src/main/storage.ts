import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { lstat, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { arrange, type Dir, type Place, type Storage, type Who } from '../shared/storage'

/** Folders an install or a build brings back. */
const REGEN = new Set(['node_modules', 'dist', 'build', 'out', '.venv', '.next', '.turbo', '.cache', '__pycache__'])
/** How many files are asked about at once: enough to keep the disk busy, few enough to leave the app alone. */
const AT_ONCE = 64

/**
 * What a folder takes on disk. A symlink is never followed, and a file linked from several places (pnpm's store) counts once: the
 * first time it is met, even across calls that share `seen`. `regen` is the part inside folders an install brings back.
 */
export async function sizeOf(root: string, seen = new Set<string>()): Promise<Dir> {
  const total: Dir = { bytes: 0, regen: 0 }
  const stack: { dir: string; regen: boolean }[] = [{ dir: root, regen: false }]
  while (stack.length) {
    const { dir, regen } = stack.pop()!
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
    const files: string[] = []
    for (const e of entries) {
      if (e.isSymbolicLink()) continue
      if (e.isDirectory()) stack.push({ dir: join(dir, e.name), regen: regen || REGEN.has(e.name) })
      else if (e.isFile()) files.push(join(dir, e.name))
    }
    for (let i = 0; i < files.length; i += AT_ONCE) {
      const stats = await Promise.all(files.slice(i, i + AT_ONCE).map((f) => lstat(f).catch(() => null)))
      for (const st of stats) {
        if (!st) continue
        if (st.nlink > 1) {
          const key = `${st.dev}:${st.ino}`
          if (seen.has(key)) continue
          seen.add(key)
        }
        // blocks, not length: a sparse or cloned file takes what the disk gives it.
        const n = st.blocks * 512
        total.bytes += n
        if (regen) total.regen += n
      }
    }
  }
  return total
}

export interface StorageReport {
  /** When the last full measuring ended; null before the first. */
  at: number | null
  measuring: boolean
  workspaces: Storage[]
  /** The app's own folder, by what is in it. */
  data: Storage | null
}

/** A worktree's agent, as this needs it. */
export type Agent = Who & { repoPath: string }

/**
 * Measures the workspaces and the app's own folder in the background, one folder at a time, telling `onChange` after each so the
 * screen fills as it goes. The last result is kept in a file so the screen has something at once next time.
 */
export class StorageService {
  private report_: StorageReport = { at: null, measuring: false, workspaces: [], data: null }
  private running: Promise<void> | null = null
  private listeners: (() => void)[] = []

  constructor(private o: { file: string; home: string; worktrees: string; agents: () => Agent[]; workspaces: () => string[]; slug: (path: string) => string; now?: () => number }) {
    try {
      const saved = JSON.parse(readFileSync(o.file, 'utf8')) as Partial<StorageReport>
      // A file written by hand or by an older version is trusted only as far as its shape: the screen reads every place.
      const ok = (s: Storage | null | undefined): s is Storage => !!s && Array.isArray(s.places)
      if (Array.isArray(saved.workspaces)) this.report_ = { at: saved.at ?? null, measuring: false, workspaces: saved.workspaces.filter(ok), data: ok(saved.data) ? saved.data : null }
    } catch {
      // nothing kept yet, or unreadable: measured again
    }
  }

  report = (): StorageReport => ({ ...this.report_, measuring: this.running !== null })
  onChange = (cb: () => void) => void this.listeners.push(cb)
  private emit = () => this.listeners.forEach((cb) => cb())

  /** Measures everything again; asking while it runs gets the run already under way. */
  measure(): Promise<void> {
    return (this.running ??= this.run().finally(() => {
      this.running = null
      this.emit()
    }))
  }

  private async run() {
    const now = this.o.now?.() ?? Date.now()
    const fresh: Storage[] = []
    this.emit()
    for (const path of this.o.workspaces()) {
      if (!existsSync(path)) continue
      const seen = new Set<string>()
      const root = join(this.o.worktrees, this.o.slug(path))
      const folder = await sizeOf(path, seen)
      const dirs: Record<string, Dir> = {}
      for (const e of await readdir(root, { withFileTypes: true }).catch(() => [])) if (e.isDirectory()) dirs[join(root, e.name)] = await sizeOf(join(root, e.name), seen)
      fresh.push(arrange({ path, name: path.split('/').pop() || path, agents: this.o.agents().filter((a) => a.repoPath === path), folder, dirs, now }))
      this.report_ = { ...this.report_, workspaces: [...fresh, ...this.report_.workspaces.filter((w) => !fresh.some((f) => f.path === w.path) && this.o.workspaces().includes(w.path))] }
      this.emit()
    }
    const data = await this.dataOf()
    this.report_ = { at: now, measuring: false, workspaces: fresh, data }
    try {
      mkdirSync(dirname(this.o.file), { recursive: true })
      writeFileSync(this.o.file, JSON.stringify(this.report_))
    } catch {
      // the next screen measures again
    }
  }

  /** What is in the app's folder besides the worktrees, biggest first; the long tail is one line. */
  private async dataOf(): Promise<Storage> {
    const places: Place[] = []
    for (const e of await readdir(this.o.home, { withFileTypes: true }).catch(() => [])) {
      if (e.isSymbolicLink() || join(this.o.home, e.name) === this.o.worktrees) continue
      const p = join(this.o.home, e.name)
      const bytes = e.isDirectory() ? (await sizeOf(p)).bytes : ((await lstat(p).catch(() => null))?.blocks ?? 0) * 512
      places.push({ id: p, name: e.name, note: '', bytes, regen: 0, kind: 'data', path: p })
    }
    places.sort((a, b) => b.bytes - a.bytes)
    const shown = places.slice(0, 12)
    const rest = places.slice(12).reduce((n, p) => n + p.bytes, 0)
    if (rest > 0) shown.push({ id: 'rest', name: `${places.length - 12} others`, note: '', bytes: rest, regen: 0, kind: 'data' })
    return { path: this.o.home, name: 'Agent World data', bytes: places.reduce((n, p) => n + p.bytes, 0), places: shown }
  }
}
