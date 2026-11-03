import workletUrl from './capture.worklet.js?worker&url'

export interface Capture {
  /** How loud the microphone is now, 0 to 1. */
  level(): number
  stop(): void
}
export interface Player {
  play(b64: string): void
  /** Stops what is playing at once (the person broke in). */
  clear(): void
  level(): number
  /** Told when the last of what was queued has finished playing (speech arrives faster than it plays). */
  onIdle: (() => void) | null
  close(): void
}

const rms = (a: AnalyserNode, buf: Uint8Array<ArrayBuffer>) => {
  a.getByteTimeDomainData(buf)
  let s = 0
  for (const v of buf) s += ((v - 128) / 128) ** 2
  return Math.min(1, Math.sqrt(s / buf.length) * 5)
}

/** The microphone as 16 kHz, 16-bit speech in blocks of about 100 ms. Throws when the microphone is blocked. */
export async function startCapture(onChunk: (pcm: ArrayBuffer) => void): Promise<Capture> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } })
  const ctx = new AudioContext({ sampleRate: 16_000 })
  try {
    await ctx.resume()
    await ctx.audioWorklet.addModule(workletUrl)
  } catch (err) {
    // Without this the microphone would stay live with nothing to stop it.
    stream.getTracks().forEach((t) => t.stop())
    void ctx.close()
    throw err
  }
  const src = ctx.createMediaStreamSource(stream)
  const node = new AudioWorkletNode(ctx, 'aw-capture')
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 512
  const buf = new Uint8Array(analyser.fftSize)
  src.connect(analyser)
  src.connect(node)
  let pending: Int16Array[] = []
  let n = 0
  node.port.onmessage = (e: MessageEvent<Float32Array>) => {
    const f = e.data
    const i16 = new Int16Array(f.length)
    for (let i = 0; i < f.length; i++) i16[i] = Math.max(-1, Math.min(1, f[i]!)) * 32767
    pending.push(i16)
    n += i16.length
    if (n < 1600) return
    const out = new Int16Array(n)
    let o = 0
    for (const p of pending) (out.set(p, o), (o += p.length))
    pending = []
    n = 0
    onChunk(out.buffer)
  }
  return {
    level: () => rms(analyser, buf),
    stop() {
      node.port.onmessage = null
      stream.getTracks().forEach((t) => t.stop())
      void ctx.close()
    }
  }
}

/** Plays the model's 24 kHz speech chunk by chunk without gaps, and can be cut off. */
export function createPlayer(): Player {
  let me: Player
  const ctx = new AudioContext()
  void ctx.resume()
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 512
  analyser.connect(ctx.destination)
  const buf = new Uint8Array(analyser.fftSize)
  let next = 0
  let live: AudioBufferSourceNode[] = []
  me = {
    onIdle: null,
    play(b64) {
      if (ctx.state === 'suspended') void ctx.resume()
      const bin = atob(b64)
      const n = bin.length >> 1
      const f = new Float32Array(n)
      for (let i = 0; i < n; i++) {
        const v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8)
        f[i] = (v > 32767 ? v - 65536 : v) / 32768
      }
      const b = ctx.createBuffer(1, n, 24_000)
      b.copyToChannel(f, 0)
      const s = ctx.createBufferSource()
      s.buffer = b
      s.connect(analyser)
      next = Math.max(next, ctx.currentTime + 0.02)
      s.start(next)
      next += b.duration
      live.push(s)
      s.onended = () => {
        live = live.filter((x) => x !== s)
        if (!live.length) me.onIdle?.()
      }
    },
    clear() {
      const was = live
      live = []
      was.forEach((s) => s.stop())
      next = 0
      me.onIdle?.()
    },
    level: () => (live.length ? rms(analyser, buf) : 0),
    close: () => void ctx.close()
  }
  return me
}
