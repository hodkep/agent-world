import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, ipcMain } from 'electron'

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

/**
 * Opt-in (AW_PERF=1): writes each stall of this process, and each long task the page reports, to perf.log in the data folder.
 * Nothing leaves the machine, and nothing runs when the variable is not set.
 */
export function startPerf(home: string) {
  const file = join(home, 'perf.log')
  const write = (entry: object) => {
    try {
      appendFileSync(file, `${JSON.stringify({ t: new Date().toISOString(), ...entry })}\n`)
    } catch {
      /* a log that cannot be written must not break the app */
    }
  }
  const monitor = new StallMonitor({ everyMs: 50, thresholdMs: 150 })
  // Every call from the page is timed, so a stall can be matched to what the main process was asked to do.
  const handle = ipcMain.handle.bind(ipcMain)
  ipcMain.handle = ((channel: string, listener: Parameters<typeof ipcMain.handle>[1]) =>
    handle(channel, async (...args: Parameters<typeof listener>) => {
      const at = Date.now()
      try {
        return await listener(...args)
      } finally {
        monitor.note(channel, at, Date.now() - at)
      }
    })) as typeof ipcMain.handle
  // CPU time this process used between two ticks: close to the stall means it was held by work; near nothing means it was not running (the machine was too busy, short of memory, or paused it).
  let cpu = process.cpuUsage()
  setInterval(() => {
    const used = process.cpuUsage(cpu)
    cpu = process.cpuUsage()
    const cpuMs = Math.round((used.user + used.system) / 1000)
    const stall = monitor.tick(Date.now())
    if (stall) write({ kind: 'main-stall', ...stall, cpuMs, procs: app.getAppMetrics().map((p) => ({ type: p.type, cpu: Math.round(p.cpu.percentCPUUsage) })) })
  }, 50)
  ipcMain.on('perf:log', (_e, entry: unknown) => {
    if (entry && typeof entry === 'object') write({ kind: 'page', ...(entry as object) })
  })
  write({ kind: 'start', pid: process.pid, version: app.getVersion() })
}
