import { execFile } from 'node:child_process'

/** The pids `lsof -Fp` names, each once. */
export const parseLsof = (out: string): number[] => [...new Set(out.split('\n').flatMap((l) => (/^p(\d+)$/.test(l) ? [Number(l.slice(1))] : [])))]

/** The pids of the processes that own the end of a connection bound to `port` in `ss -tnp` output (the client's end, not the server's). */
export function parseSs(out: string, port: number): number[] {
  const pids = out.split('\n').flatMap((l) => {
    const cols = l.trim().split(/\s+/)
    // State, recv-q, send-q, local address, peer address, then the users column.
    return cols[3]?.endsWith(`:${port}`) ? [...l.matchAll(/pid=(\d+)/g)].map((m) => Number(m[1])) : []
  })
  return [...new Set(pids)]
}

const ask = (file: string, args: string[]) => new Promise<string>((resolve, reject) => execFile(file, args, { timeout: 3000 }, (err, stdout) => (err ? reject(err) : resolve(stdout))))

/** The processes on a local connection, found by its client port, or null when they cannot be told (no lsof or ss, or the connection is gone). */
export async function peerPids(port: number, run: (file: string, args: string[]) => Promise<string> = ask): Promise<number[] | null> {
  try {
    const pids = parseLsof(await run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:ESTABLISHED', '-Fp']))
    if (pids.length) return pids
  } catch {
    /* lsof missing or found nothing: try ss */
  }
  try {
    const pids = parseSs(await run('ss', ['-tnp', 'state', 'established']), port)
    return pids.length ? pids : null
  } catch {
    return null
  }
}

/** Is this connection the agent's own program's, rather than a command the program ran? Every process on it besides the app must be the program; anything unknown is no. */
export function fromAgentProgram(pids: number[], programPid: number | undefined, appPid: number): boolean {
  const others = pids.filter((p) => p !== appPid)
  return programPid !== undefined && others.length > 0 && others.every((p) => p === programPid)
}
