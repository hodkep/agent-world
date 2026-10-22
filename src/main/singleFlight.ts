/** Wraps an async call so that everyone who asks while it runs shares the one call and its result; an ask after it ends starts it again. */
export function singleFlight<T>(run: () => Promise<T>) {
  let flight: Promise<T> | null = null
  const f = () => (flight ??= run().finally(() => (flight = null)))
  f.running = () => flight !== null
  return f
}
