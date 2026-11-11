import { monitorEventLoopDelay } from 'node:perf_hooks'
import { join } from 'node:path'
import { app, ipcMain } from 'electron'
import { BLOCKED_MS, LogFile, summaryEntry, timeSync, timed } from './perfLog'

export interface Call {
  what: string
  at: number
  ms: number
}
export interface Stall {
  lateMs: number
  from: number
  to: number
  ran: Call[]
}

/** Notices when a regular tick arrives late (the process was busy) and names the calls that were running at the time. */
export class StallMonitor {
  private last: number | null = null
  private calls: Call[] = []
  private readonly everyMs: number
  private readonly thresholdMs: number
  private readonly keep: number
  constructor(o: { everyMs: number; thresholdMs: number; keep?: number }) {
    this.everyMs = o.everyMs
    this.thresholdMs = o.thresholdMs
    this.keep = o.keep ?? 50
  }

  note(what: string, at: number, ms: number) {
    this.calls.push({ what, at, ms })
    if (this.calls.length > this.keep) this.calls.splice(0, this.calls.length - this.keep)
  }

  tick(now: number): Stall | null {
    const last = this.last
    this.last = now
    if (last === null) return null
    const from = last + this.everyMs
    const lateMs = now - from
    if (lateMs < this.thresholdMs) return null
    return { lateMs, from, to: now, ran: this.calls.filter((c) => c.at + c.ms > from && c.at <= now) }
  }
}

/** Where a sweep on a timer reports to: set once the watchdog runs. */
let sink: ((name: string, ms: number) => void) | null = null

/** A sweep the main process runs on a timer, timed under a name. It is the sweep itself until the watchdog is started. */
export const watched =
  <A extends unknown[], R>(name: string, fn: (...a: A) => R) =>
  (...a: A): R =>
    sink ? timeSync(() => fn(...a), (ms) => sink?.(name, ms)) : fn(...a)

/**
 * The watchdog, off unless AW_PERF is set (its timers cost energy): it names what holds this process, in perf.log in the data folder. A call from the page, or a sweep on a
 * timer, that holds the process for 100 ms or more is written as `blocked` with its name and how long; a late tick of the loop is written as
 * `main-stall` with the calls that ran in it; each minute a `summary` line says how late the loop ran. Only names, times and counts are written, never
 * what a call was given. Nothing leaves the machine. With `verbose` (AW_PERF=1) a stall also says how much CPU was used and the page's long tasks are kept.
 */
export function startPerf(home: string, mode: 'on' | 'verbose' = 'on') {
  const verbose = mode === 'verbose'
  const log = new LogFile(join(home, 'perf.log'), { capBytes: 1_000_000, flushMs: 1000 })
  const write = (entry: object) => log.add(JSON.stringify({ t: new Date().toISOString(), ...entry }))
  const monitor = new StallMonitor({ everyMs: 50, thresholdMs: 150 })
  // Counted from now, so a stall while the rest of the app starts (nothing else has run yet) is reported by the first tick, not ignored as the one that began the count.
  monitor.tick(Date.now())
  let stalls = 0
  let blocked = 0
  const seen = (name: string, ms: number) => {
    monitor.note(name, Date.now() - ms, ms)
    if (ms < BLOCKED_MS) return
    blocked++
    write({ kind: 'blocked', what: name, ms: Math.round(ms) })
  }
  sink = seen
  // Every call from the page is timed for the part that holds the process (the synchronous start of an async handler), so a stall can be matched to what the main process was asked to do.
  const handle = ipcMain.handle.bind(ipcMain)
  ipcMain.handle = ((channel: string, listener: Parameters<typeof ipcMain.handle>[1]) => handle(channel, timed(channel, listener, seen))) as typeof ipcMain.handle
  const on = ipcMain.on.bind(ipcMain)
  ipcMain.on = ((channel: string, listener: Parameters<typeof ipcMain.on>[1]) => on(channel, timed(channel, listener, seen))) as typeof ipcMain.on
  // CPU time this process used between two ticks: close to the stall means it was held by work; near nothing means it was not running (the machine was too busy, short of memory, or paused it).
  let cpu = process.cpuUsage()
  const tick = setInterval(() => {
    const used = process.cpuUsage(cpu)
    cpu = process.cpuUsage()
    const stall = monitor.tick(Date.now())
    if (!stall) return
    stalls++
    write({
      kind: 'main-stall',
      lateMs: Math.round(stall.lateMs),
      ran: stall.ran.map((c) => ({ what: c.what, ms: Math.round(c.ms) })),
      ...(verbose && { cpuMs: Math.round((used.user + used.system) / 1000), procs: app.getAppMetrics().map((p) => ({ type: p.type, cpu: Math.round(p.cpu.percentCPUUsage) })) })
    })
  }, 50)
  tick.unref()
  const loop = monitorEventLoopDelay({ resolution: 10 })
  loop.enable()
  const minute = setInterval(() => {
    write(summaryEntry(loop, { stalls, blocked }))
    loop.reset()
    stalls = 0
    blocked = 0
  }, 60_000)
  minute.unref()
  if (verbose)
    ipcMain.on('perf:log', (_e, entry: unknown) => {
      if (entry && typeof entry === 'object') write({ kind: 'page', ...(entry as object) })
    })
  app.on('before-quit', () => log.flushSync())
  write({ kind: 'start', pid: process.pid, version: app.getVersion() })
}
