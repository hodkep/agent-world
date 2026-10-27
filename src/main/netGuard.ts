import { lookup as dnsLookup, type LookupAddress } from 'node:dns'
import { isIP } from 'node:net'

const v4 = (s: string): number[] | null => {
  const p = s.split('.')
  if (p.length !== 4 || !p.every((x) => /^\d{1,3}$/.test(x) && Number(x) <= 255)) return null
  return p.map(Number)
}

function publicV4(b: number[]): boolean {
  const [a, c, d] = b as [number, number, number, number]
  if (a === 0 || a === 10 || a === 127) return false
  if (a === 100 && c >= 64 && c <= 127) return false // carrier-grade NAT
  if (a === 169 && c === 254) return false // link-local, the cloud metadata address
  if (a === 172 && c >= 16 && c <= 31) return false
  if (a === 192 && c === 0 && (d === 0 || d === 2)) return false // 192.0.0.0/24 and 192.0.2.0/24
  if (a === 192 && c === 168) return false
  if (a === 198 && (c === 18 || c === 19)) return false // benchmarking
  if (a === 198 && c === 51 && d === 100) return false
  if (a === 203 && c === 0 && d === 113) return false
  if (a >= 224) return false // multicast, reserved, broadcast
  return true
}

/** Eight 16-bit groups of an IPv6 address, or null. */
function groups(ip: string): number[] | null {
  let s = ip.toLowerCase()
  const tail = s.lastIndexOf(':')
  if (s.includes('.')) {
    const q = v4(s.slice(tail + 1))
    if (!q) return null
    s = `${s.slice(0, tail + 1)}${((q[0]! << 8) | q[1]!).toString(16)}:${((q[2]! << 8) | q[3]!).toString(16)}`
  }
  const halves = s.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const missing = 8 - head.length - rest.length
  if ((halves.length === 1 && missing !== 0) || missing < 0 || (halves.length === 2 && missing < 1)) return null
  const all = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...rest]
  if (all.length !== 8 || !all.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null
  return all.map((g) => parseInt(g, 16))
}

const embedded = (hi: number, lo: number) => [hi >> 8, hi & 255, lo >> 8, lo & 255]

/** Whether an address is somewhere on the public internet: not this machine, not a private or link-local network, not a reserved range, and not one of those written another way. */
export function isPublicAddress(ip: string): boolean {
  const kind = isIP(ip)
  if (kind === 4) return publicV4(v4(ip)!)
  if (kind !== 6) return false
  const g = groups(ip)
  if (!g) return false
  const [a, b, c, d, e, f, hi, lo] = g as [number, number, number, number, number, number, number, number]
  if (g.every((x) => x === 0) || (g.slice(0, 7).every((x) => x === 0) && lo === 1)) return false // :: and ::1
  if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && f === 0xffff) return publicV4(embedded(hi, lo)) // mapped IPv4
  if (a === 0x64 && b === 0xff9b && c === 0 && d === 0 && e === 0 && f === 0) return publicV4(embedded(hi, lo)) // NAT64
  if (a === 0x2002) return publicV4(embedded(b, c)) // 6to4
  if ((a & 0xfe00) === 0xfc00) return false // unique local
  if ((a & 0xffc0) === 0xfe80) return false // link-local
  if ((a & 0xff00) === 0xff00) return false // multicast
  if (a === 0x2001 && (b === 0xdb8 || b === 0)) return false // documentation, teredo
  if (a === 0x100 && b === 0 && c === 0 && d === 0) return false // discard-only
  return true
}

type Resolve = (host: string) => Promise<LookupAddress[]>
const system: Resolve = (host) => new Promise((ok, no) => dnsLookup(host, { all: true }, (e, list) => (e ? no(e) : ok(list))))

/**
 * A `lookup` for a connection to use: it answers only when every address the name leads to is public, and the connection is made to the address it answers with, so there is no gap between checking and connecting for a name to be changed in.
 * `allowLocal` is for a test that talks to its own server.
 */
export function guardedLookup(resolve: Resolve = system, o: { allowLocal?: boolean } = {}) {
  return (host: string, options: { all?: boolean }, cb: (err: Error | null, address?: string | LookupAddress[], family?: number) => void) => {
    const done = (list: LookupAddress[]) => {
      if (!list.length) return cb(new Error(`${host} leads nowhere.`))
      if (!o.allowLocal && !list.every((a) => isPublicAddress(a.address))) return cb(new Error(`${host} leads to a private or local address: only public sites may be loaded.`))
      // The connection may ask for every address (to try them in turn) or for one.
      if (options?.all) cb(null, list)
      else cb(null, list[0]!.address, list[0]!.family)
    }
    if (isIP(host)) return done([{ address: host, family: isIP(host) }])
    resolve(host).then(done, (e: Error) => cb(e))
  }
}
