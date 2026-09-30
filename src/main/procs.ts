import { execFile } from 'node:child_process'
import type { ProcInfo } from '../shared/types'

/** Everything running below `root` in `ps -A -o pid=,ppid=,command=` output, oldest ancestors first. */
export function descendants(psOut: string, root: number): ProcInfo[] {
  const rows = psOut.split('\n').flatMap((l) => {
    const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(l)
    return m ? [{ pid: +m[1]!, ppid: +m[2]!, command: m[3]!.trim() }] : []
  })
  const out: ProcInfo[] = []
  const seen = new Set([root])
  for (let grew = true; grew; ) {
    grew = false
    for (const r of rows)
      if (!seen.has(r.pid) && seen.has(r.ppid)) {
        seen.add(r.pid)
        out.push({ pid: r.pid, command: r.command })
        grew = true
      }
  }
  return out
}

const ps = () => new Promise<string>((res) => execFile('ps', ['-A', '-o', 'pid=,ppid=,command='], { maxBuffer: 8e6 }, (_e, so) => res(so ?? '')))

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
