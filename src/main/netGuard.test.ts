import { describe, expect, it } from 'vitest'
import { guardedLookup, isPublicAddress } from './netGuard'

describe('which addresses a widget\'s data may come from', () => {
  it('allows ordinary public addresses, both kinds', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.15.0.1', '172.32.0.1', '11.0.0.1', '2606:4700:4700::1111', '2a00:1450:4001:81b::200e']) expect(isPublicAddress(ip), ip).toBe(true)
  })
  it('refuses this machine, private networks, link-local (the cloud metadata address), carrier, test, multicast and reserved ranges', () => {
    for (const ip of ['0.0.0.0', '0.1.2.3', '127.0.0.1', '127.255.255.254', '10.0.0.1', '10.255.255.255', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '169.254.0.1', '100.64.0.1', '100.127.255.255', '192.0.0.1', '198.18.0.1', '198.19.255.255', '192.0.2.1', '198.51.100.1', '203.0.113.1', '224.0.0.1', '239.255.255.255', '240.0.0.1', '255.255.255.255']) expect(isPublicAddress(ip), ip).toBe(false)
    for (const ip of ['::', '::1', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'febf::1', 'ff02::1', '2001:db8::1', '2001::1', '100::1']) expect(isPublicAddress(ip), ip).toBe(false)
  })
  it('sees through an IPv4 address written as IPv6 (mapped, NAT64, 6to4), which would otherwise be a way round', () => {
    for (const ip of ['::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.1', '::ffff:a00:1', '::ffff:169.254.169.254', '64:ff9b::7f00:1', '64:ff9b::a00:1', '2002:7f00:1::', '2002:a9fe:a9fe::1']) expect(isPublicAddress(ip), ip).toBe(false)
    for (const ip of ['::ffff:8.8.8.8', '64:ff9b::808:808', '2002:808:808::1']) expect(isPublicAddress(ip), ip).toBe(true)
  })
  it('refuses what is not an address at all', () => {
    for (const ip of ['', 'localhost', '1.2.3', '1.2.3.4.5', '999.1.1.1', 'gggg::1', '1.2.3.4/8']) expect(isPublicAddress(ip), ip).toBe(false)
  })
})

describe('looking a name up for a widget', () => {
  const resolver = (map: Record<string, string[]>) => async (host: string) => (map[host] ?? []).map((address) => ({ address, family: address.includes(':') ? 6 : 4 }))
  const look = (lookup: ReturnType<typeof guardedLookup>, host: string, all = false) => new Promise<{ err: Error | null; address?: unknown }>((res) => lookup(host, { all }, (err, address) => res({ err, address })))

  it('answers with a public address', async () => {
    const r = await look(guardedLookup(resolver({ 'a.example.com': ['93.184.216.34'] })), 'a.example.com')
    expect(r.err).toBeNull()
    expect(r.address).toBe('93.184.216.34')
  })
  it('refuses a name that leads anywhere private, even if it also leads somewhere public (a name that flips between them)', async () => {
    for (const ips of [['127.0.0.1'], ['10.1.2.3'], ['169.254.169.254'], ['93.184.216.34', '10.0.0.5'], ['::1'], ['::ffff:127.0.0.1']]) {
      const r = await look(guardedLookup(resolver({ 'evil.example.com': ips })), 'evil.example.com')
      expect(r.err, ips.join()).not.toBeNull()
      expect(r.err!.message).toMatch(/private|local|public/i)
    }
  })
  it('refuses a name that leads nowhere, and an address given in place of a name', async () => {
    expect((await look(guardedLookup(resolver({})), 'nothing.example.com')).err).not.toBeNull()
    expect((await look(guardedLookup(resolver({})), '127.0.0.1')).err).not.toBeNull()
    expect((await look(guardedLookup(resolver({})), '8.8.8.8')).err).toBeNull()
  })
  it('gives every address when the connection asks for them all, still only when all are public', async () => {
    const ok = await look(guardedLookup(resolver({ 'a.example.com': ['93.184.216.34', '2606:4700:4700::1111'] })), 'a.example.com', true)
    expect(ok.address).toEqual([{ address: '93.184.216.34', family: 4 }, { address: '2606:4700:4700::1111', family: 6 }])
    expect((await look(guardedLookup(resolver({ 'a.example.com': ['93.184.216.34', '127.0.0.1'] })), 'a.example.com', true)).err).not.toBeNull()
  })
  it('lets local addresses through only when asked to, for a test that talks to its own server', async () => {
    const r = await look(guardedLookup(resolver({ 'localtest.example.com': ['127.0.0.1'] }), { allowLocal: true }), 'localtest.example.com')
    expect(r.err).toBeNull()
  })
})
