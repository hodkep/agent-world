import { spawn } from 'node:child_process'

export interface CheckResult {
  /** The program's exit code; none when it was killed at the time limit or could not start. */
  exit: number | null
  timedOut: boolean
  /** The end of what it printed, cleaned of colour codes. */
  tail: string
  ms: number
}

const TIMEOUT_MS = 5 * 60_000
const TAIL_BYTES = 4096
/** More than this is dropped from the front as it arrives, so a command that prints without end cannot fill memory. */
const KEEP_BYTES = 256 * 1024
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g

/** The end of the output, starting at a line so it never opens in the middle of one. */
function tailOf(out: string, bytes: number): string {
  const clean = out.replace(ANSI, '').replace(/\r\n?/g, '\n').trim()
  if (clean.length <= bytes) return clean
  const cut = clean.slice(clean.length - bytes)
  const nl = cut.indexOf('\n')
  return `…\n${nl >= 0 ? cut.slice(nl + 1) : cut}`
}

/** The environment a check gets: the app's own with the person's login PATH, minus what belongs to the office (its settings and the tokens it hands its agents). */
export function checkEnv(env: NodeJS.ProcessEnv, loginPath: string): NodeJS.ProcessEnv {
  const kept = Object.fromEntries(Object.entries(env).filter(([k]) => !k.startsWith('AW_') && k !== 'ELECTRON_RUN_AS_NODE'))
  return { ...kept, PATH: loginPath }
}

/**
 * Runs a command through the shell in `cwd` and says how it ended. It gets exactly the environment it is passed (the caller leaves the office's
 * tokens out), and at the time limit the shell and everything it started are killed.
 */
export function runCheck(command: string, cwd: string, o: { timeoutMs?: number; tailBytes?: number; env?: NodeJS.ProcessEnv } = {}): Promise<CheckResult> {
  const started = Date.now()
  const win = process.platform === 'win32'
  return new Promise((resolve) => {
    // Its own process group on Unix, so the whole tree can be killed together.
    const child = spawn(win ? 'cmd.exe' : '/bin/sh', win ? ['/d', '/s', '/c', command] : ['-c', command], { cwd, env: o.env ?? process.env, detached: !win, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let timedOut = false
    let done = false
    const take = (d: Buffer) => {
      out += d
      if (out.length > KEEP_BYTES) out = out.slice(out.length - KEEP_BYTES)
    }
    child.stdout.on('data', take)
    child.stderr.on('data', take)
    const finish = (exit: number | null) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve({ exit, timedOut, tail: tailOf(out, o.tailBytes ?? TAIL_BYTES), ms: Date.now() - started })
    }
    const timer = setTimeout(() => {
      timedOut = true
      try {
        if (win) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
        else process.kill(-child.pid!, 'SIGKILL')
      } catch {
        child.kill('SIGKILL')
      }
      // Whatever held the pipes open is gone now; do not wait for them to close.
      setTimeout(() => finish(null), 200)
    }, o.timeoutMs ?? TIMEOUT_MS)
    child.on('error', (e) => {
      out += String(e.message)
      finish(null)
    })
    child.on('close', (code) => finish(timedOut ? null : code))
  })
}
