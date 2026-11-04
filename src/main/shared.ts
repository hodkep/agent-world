/**
 * One answer for callers that ask for the same thing close together: a call made while one runs gets that one, and a call made within
 * `ttlMs` of its end gets its answer. A failure is not kept. `clear()` is for when something changed (the person acted, an event went out):
 * what was asked before it is not shared with anyone asking after it. Used where several windows or chats poll the same slow thing (a `ps`, a git status).
 */
export function shared<T>(ttlMs: number, now: () => number = Date.now) {
  const kept = new Map<string, { ended?: number; value: Promise<T> }>()
  const get = (key: string, make: () => Promise<T>): Promise<T> => {
    const hit = kept.get(key)
    // Running, or ended less than `ttlMs` ago.
    if (hit && (hit.ended === undefined || now() - hit.ended < ttlMs)) return hit.value
    const entry: { ended?: number; value: Promise<T> } = { value: make() }
    kept.set(key, entry)
    entry.value.then(
      () => void (entry.ended = now()),
      () => void (kept.get(key) === entry && kept.delete(key))
    )
    return entry.value
  }
  return Object.assign(get, { clear: () => kept.clear() })
}
