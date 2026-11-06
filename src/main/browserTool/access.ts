import { hostOf, needsAsking } from '../../renderer/panel/previewSites'

/**
 * Which addresses a tool may open on an agent's Preview. The Preview's own rule applies to it: a page on this computer opens at once, a site on the internet
 * only once the person allowed it, and when it is not, the person is asked (in the Preview) and the tool waits for the answer a little while, then is told to try again: the question stays on
 * the screen, and a site the person allows is remembered, so the same command then goes straight through.
 */
/** A tool gives up on a command after about half a minute by itself and says only "Resource temporarily unavailable": the answer comes before that, and says what is going on. */
const TOOL_PATIENCE_MS = 15_000

export function createAccess(o: { ask: (a: { agentId: string; url: string }) => void; timeoutMs?: number }) {
  let allowed: string[] = []
  const waiting = new Map<string, { host: string; done: (why: string | null) => void; promise: Promise<string | null> }>()

  function mayOpen(agentId: string, url: string): Promise<string | null> {
    if (!needsAsking(url, allowed)) return Promise.resolve(null)
    const host = hostOf(url)
    const key = `${agentId}\n${host}`
    const pending = waiting.get(key)
    if (pending) return pending.promise
    let done!: (why: string | null) => void
    const promise = new Promise<string | null>((r) => (done = r))
    const timer = setTimeout(() => finish(`${host} is waiting for the person’s OK: the Preview is asking them now. Tell the person, and run the same command again after they have answered`), o.timeoutMs ?? TOOL_PATIENCE_MS)
    const finish = (why: string | null) => (clearTimeout(timer), waiting.delete(key), done(why))
    waiting.set(key, { host, done: finish, promise })
    o.ask({ agentId, url })
    return promise
  }

  return {
    mayOpen,
    /** The sites the person has allowed: anyone waiting on one of them goes ahead. */
    setAllowed(list: string[]) {
      allowed = list
      for (const w of [...waiting.values()]) if (allowed.includes(w.host)) w.done(null)
    },
    /** The person's answer to the question, when it is no. */
    answer(agentId: string, url: string, ok: boolean) {
      const w = waiting.get(`${agentId}\n${hostOf(url)}`)
      if (w) w.done(ok ? null : `The person said not now: ${w.host} is not allowed in the Preview`)
    }
  }
}
