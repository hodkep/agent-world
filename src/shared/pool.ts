/**
 * Does `work` for each item, at most `size` at a time: the next begins as soon as one ends, not in rounds. Results are in the order of the items, and empty for any
 * not started because `stop` said so (those running finish). A job that throws does not stop the others; the first error is thrown at the end.
 */
export async function inBatches<T, R>(items: T[], size: number, work: (item: T, i: number) => Promise<R>, stop: () => boolean = () => false): Promise<(R | undefined)[]> {
  const out: (R | undefined)[] = items.map(() => undefined)
  let next = 0
  let failure: { e: unknown } | undefined
  const lane = async () => {
    while (!stop() && next < items.length) {
      const i = next++
      try {
        out[i] = await work(items[i]!, i)
      } catch (e) {
        failure ??= { e }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, lane))
  if (failure) throw failure.e
  return out
}
