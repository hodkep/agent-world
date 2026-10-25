import { execFile } from 'node:child_process'
import type { ProcInfo } from '../shared/types'

const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'fish'])
const seconds = (etime: string) => {
  const [days, rest] = etime.includes('-') ? etime.split('-') : ['0', etime]
  return rest!.split(':').reduce((t, n) => t * 60 + +n, 0) + +days! * 86400
}

/**
 * What the agent's commands left running, from `ps -A -o pid=,ppid=,etime=,command=`. Only what sits under a shell
 * counts: that is how Claude runs a command, while its own MCP servers and helpers are not the user's to stop.
 * Anything younger than 3 s is a command still starting, or a hook, and is left out.
 */
export function descendants(psOut: string, root: number): ProcInfo[] {
  const rows = psOut.split('\n').flatMap((l) => {
    const m = /^\s*(\d+)\s+(\d+)\s+([\d:-]+)\s+(.*)$/.exec(l)
    return m ? [{ pid: +m[1]!, ppid: +m[2]!, age: seconds(m[3]!), command: m[4]!.trim() }] : []
  })
  const out: ProcInfo[] = []
  const under = new Map<number, boolean>() // pid -> sits under a shell that Claude started
  for (let grew = true; grew; ) {
    grew = false
    for (const r of rows) {
      if (under.has(r.pid)) continue
      const first = r.ppid === root
      if (!first && !under.has(r.ppid)) continue
      const shell = first && SHELLS.has((r.command.split(/\s+/)[0] ?? '').split('/').pop() ?? '')
      if (first && !shell) continue
      under.set(r.pid, true)
      grew = true
      if (r.age < 3) continue
      // The wrapping shell is only noise once its command is listed below it.
      if (first && rows.some((c) => c.ppid === r.pid && c.age >= 3)) continue
      out.push({ pid: r.pid, command: r.command, age: r.age })
    }
  }
  return out
}

const ps = () => new Promise<string>((res) => execFile('ps', ['-A', '-o', 'pid=,ppid=,etime=,command='], { maxBuffer: 8e6 }, (_e, so) => res(so ?? '')))

// Windows has no `ps`; the list is simply empty there.
export const listProcs = async (root: number): Promise<ProcInfo[]> => (process.platform === 'win32' ? [] : descendants(await ps(), root))

/** Stops a process only if it is still below the agent, so a recycled pid is never touched. */
export async function stopProc(root: number, pid: number): Promise<boolean> {
  if (!(await listProcs(root)).some((p) => p.pid === pid)) return false
  try {
    process.kill(pid, 'SIGTERM')
    return true
  } catch {
    return false
  }
}
