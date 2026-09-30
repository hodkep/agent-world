import { connect } from 'node:net'
import { stripVTControlCharacters } from 'node:util'

export interface LocalServer {
  port: number
  /** Always on `localhost`, whichever loopback name the tool printed. */
  url: string
}

const URL_AT = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\]):(\d{1,5})((?:\/[^\s"'<>)\]]*)?)/g

/** Dev-server addresses in a chunk of terminal output (http only: dev servers print plain http). */
export function findLocalServers(output: string, ignore: number[] = []): LocalServer[] {
  const seen = new Map<number, LocalServer>()
  for (const m of stripVTControlCharacters(output).matchAll(URL_AT)) {
    const port = Number(m[1])
    if (port < 1024 || port > 65535 || ignore.includes(port) || seen.has(port) || !m[0].startsWith('http://')) continue
    seen.set(port, { port, url: `http://localhost:${port}${m[2] || '/'}` })
  }
  return [...seen.values()]
}

/** Is something accepting connections on this port (on either loopback address)? */
export function isListening(port: number, timeoutMs = 400): Promise<boolean> {
  const probe = (host: string) =>
    new Promise<boolean>((resolve) => {
      const s = connect({ port, host, timeout: timeoutMs })
      s.once('connect', () => (s.destroy(), resolve(true)))
      s.once('timeout', () => (s.destroy(), resolve(false)))
      s.once('error', () => resolve(false))
    })
  return Promise.all([probe('127.0.0.1'), probe('::1')]).then(([a, b]) => a || b)
}
