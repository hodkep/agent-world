/** While the key is held: is the microphone giving any sound? A hold of two seconds with nothing near speech loudness says it is not. */
export function holdHint(o: { heldMs: number; peak: number }): 'ok' | 'silent' {
  return o.heldMs >= 2000 && o.peak < 0.02 ? 'silent' : 'ok'
}

/**
 * The one microphone button does both jobs: held, it is push to talk; tapped, it leaves the microphone on (hands-free) until it is pressed again.
 * What coming up means: the end of a push, the turning on of hands-free after a quick tap, or the turning off of hands-free.
 */
export function micAction(o: { handsFree: boolean; heldMs: number }): 'end-push' | 'hands-free-on' | 'hands-free-off' {
  if (o.handsFree) return 'hands-free-off'
  return o.heldMs < 250 ? 'hands-free-on' : 'end-push'
}
