/**
 * Restarts each agent, asking again while it says it is still finishing its turn: an agent that has only just stopped is not marked idle for a few
 * seconds. Returns the ids it could not restart (a different refusal at once, a turn still going when the tries run out).
 */
export async function restartWhenIdle(ids: string[], restart: (id: string) => Promise<unknown>, sleep: () => Promise<void> = () => new Promise((r) => setTimeout(r, 1000)), tries = 5): Promise<string[]> {
  const failed: string[] = []
  for (const id of ids) {
    for (let n = 0; ; n++) {
      try {
        await restart(id)
        break
      } catch (e) {
        if (!/Wait until it finishes/.test(e instanceof Error ? e.message : String(e)) || n >= tries) {
          failed.push(id)
          break
        }
        await sleep()
      }
    }
  }
  return failed
}
