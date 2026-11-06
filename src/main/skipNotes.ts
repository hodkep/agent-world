/**
 * Steps the person skips one after another (Commit, then Push, then Pull request) are told to the agent once, a moment after the last,
 * so it answers one note and not each in turn. `told` gets the run, every name, the last step skipped and the notes they wrote.
 */
export function skipHold(told: (run: string, names: string[], last: string, note?: string) => void, ms = 2000) {
  const held = new Map<string, { names: string[]; note?: string; timer: ReturnType<typeof setTimeout> }>()
  return (run: string, name: string, step: string, note?: string) => {
    const h = held.get(run)
    if (h) clearTimeout(h.timer)
    const names = [...(h?.names ?? []), name]
    const said = [h?.note, note].filter(Boolean).join(' · ') || undefined
    held.set(run, {
      names,
      note: said,
      timer: setTimeout(() => {
        held.delete(run)
        told(run, names, step, said)
      }, ms)
    })
  }
}
