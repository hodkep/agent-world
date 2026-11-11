import { appendFileSync, renameSync, statSync } from 'node:fs'
import { appendFile, rename, stat } from 'node:fs/promises'

/** A call that holds the main process for this long is written down the moment it returns. */
export const BLOCKED_MS = 100

/** Whether the watchdog runs: off unless AW_PERF is set, because its timers wake the app about 120 times a second and macOS lists it under "Using Significant Energy". AW_PERF=1 adds the detail a stall entry can carry and the page's long tasks. */
export const perfMode = (env: NodeJS.ProcessEnv): 'off' | 'on' | 'verbose' => (!env.AW_PERF || env.AW_PERF === '0' ? 'off' : env.AW_PERF === '1' ? 'verbose' : 'on')

/**
 * A log file that is written off the call that adds to it: lines wait in a buffer and are appended together a moment later, in order.
 * At the cap the file becomes `.1` (the one before it is dropped) and a new one starts, so it never holds more than about twice the cap.
 * A log that cannot be written is lost quietly: it must never break the app.
 */
export class LogFile {
  private pending: string[] = []
  private bytes: number | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private chain: Promise<void> = Promise.resolve()
  constructor(
    private readonly file: string,
    private readonly o: { capBytes: number; flushMs: number }
  ) {}

  add(line: string) {
    this.pending.push(line)
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush()
    }, this.o.flushMs)
    this.timer.unref?.()
  }

  private take(): string {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    const text = this.pending.map((l) => `${l}\n`).join('')
    this.pending = []
    return text
  }

  flush(): Promise<void> {
    const text = this.take()
    if (text) this.chain = this.chain.then(() => this.write(text))
    return this.chain
  }

  private async write(text: string) {
    try {
      this.bytes ??= await stat(this.file).then((s) => s.size, () => 0)
      if (this.bytes > 0 && this.bytes + text.length > this.o.capBytes) {
        await rename(this.file, `${this.file}.1`)
        this.bytes = 0
      }
      await appendFile(this.file, text)
      this.bytes += Buffer.byteLength(text)
    } catch {
      /* lost: see above */
    }
  }

  /** For the moment the app quits, when nothing later will run. */
  flushSync() {
    const text = this.take()
    if (!text) return
    try {
      this.bytes ??= (() => { try { return statSync(this.file).size } catch { return 0 } })()
      if (this.bytes > 0 && this.bytes + text.length > this.o.capBytes) {
        renameSync(this.file, `${this.file}.1`)
        this.bytes = 0
      }
      appendFileSync(this.file, text)
      this.bytes += Buffer.byteLength(text)
    } catch {
      /* lost */
    }
  }
}

/** Runs `fn` and says how long it held the process before it returned: for an async call, its synchronous start and not the wait for its promise. */
export function timeSync<T>(fn: () => T, done: (ms: number) => void, clock: () => number = () => performance.now()): T {
  const t = clock()
  try {
    return fn()
  } finally {
    done(clock() - t)
  }
}

/** A listener that is timed under a channel's name. What it is given and what it returns pass through untouched, and only the name and the time are told to `seen`. */
export const timed =
  <A extends unknown[], R>(name: string, listener: (...a: A) => R, seen: (name: string, ms: number) => void, clock?: () => number) =>
  (...a: A): R =>
    timeSync(() => listener(...a), (ms) => seen(name, ms), clock)

/** The minute's summary line: how late the main process's loop ran (from perf_hooks, in nanoseconds) and how many stalls and blocking calls there were. */
export const summaryEntry = (h: { percentile(p: number): number; max: number }, counts: { stalls: number; blocked: number }) => ({
  kind: 'summary',
  loopMedianMs: Math.round(h.percentile(50) / 1e6),
  loopP99Ms: Math.round(h.percentile(99) / 1e6),
  loopMaxMs: Math.round(h.max / 1e6),
  ...counts
})
