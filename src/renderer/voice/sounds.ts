/** One note of a chime: its pitch, when it starts and how long it lasts, in seconds. */
export interface Note { freq: number; at: number; dur: number }

/**
 * The two sounds of a call, as notes: a rising pair when it connects and a falling pair when it ends. Short, in the app's 8-bit voice, so they
 * tell without getting in the way of the first words.
 */
export function chime(kind: 'start' | 'end'): Note[] {
  return kind === 'start'
    ? [{ freq: 523.25, at: 0, dur: 0.09 }, { freq: 783.99, at: 0.1, dur: 0.14 }]
    : [{ freq: 783.99, at: 0, dur: 0.09 }, { freq: 523.25, at: 0.1, dur: 0.16 }]
}

// One audio context for the chimes, apart from the talk's own: the one for the talk is closed when the talk ends, and the end sound comes after.
let ctx: AudioContext | null = null

/** Plays the sound as square-wave blips with a quick fade, quietly. Nothing happens where audio is not available. */
export function playChime(kind: 'start' | 'end') {
  try {
    ctx ??= new AudioContext()
    void ctx.resume()
    const t0 = ctx.currentTime + 0.02
    for (const n of chime(kind)) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'square'
      osc.frequency.value = n.freq
      gain.gain.setValueAtTime(0.0001, t0 + n.at)
      gain.gain.linearRampToValueAtTime(0.06, t0 + n.at + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.dur)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t0 + n.at)
      osc.stop(t0 + n.at + n.dur + 0.02)
    }
  } catch {
    /* no audio here: the call goes on without its chime */
  }
}
