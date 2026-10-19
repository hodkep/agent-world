export const DID_NOT_TAKE = 'The program did not take Esc. Answer it in the terminal.'

/**
 * Esc for a question or plan that is open: pressed once, however many times it is asked while that is under way (a second Esc would
 * reach the agent's next step), then waited on until the card has closed. If it has not, the program did not take it: say so.
 */
export async function cancelNeed(o: { id: string; inFlight: Set<string>; isOpen: () => boolean; press: () => void; sleep: (ms: number) => Promise<void>; timeoutMs?: number; pollMs?: number }): Promise<void> {
  if (o.inFlight.has(o.id)) return
  if (!o.isOpen()) throw new Error('That is no longer open.')
  o.inFlight.add(o.id)
  try {
    o.press()
    const pollMs = o.pollMs ?? 100
    for (let waited = 0; waited < (o.timeoutMs ?? 2000); waited += pollMs) {
      await o.sleep(pollMs)
      if (!o.isOpen()) return
    }
    throw new Error(DID_NOT_TAKE)
  } finally {
    o.inFlight.delete(o.id)
  }
}
